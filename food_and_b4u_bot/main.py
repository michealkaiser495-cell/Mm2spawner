"""
Food and b4u Order Desk v4 - Discord ticket bot (discord.py 2.7+)

Run:
    pip install -U "discord.py>=2.7"
    python main.py

Token: paste it into TOKEN below, or set the DISCORD_TOKEN environment variable.

Who can use slash commands: the server owner / administrators and the chef role.
Setup commands (/ticket /setchef /setlogs /panel) are owner/admin only.

Message Content Intent (Developer Portal -> Bot) is OPTIONAL:
  - ON : customers can answer each step with pop-up forms OR by typing in chat.
  - OFF: customers answer with pop-up forms (buttons). Nothing crashes.
"""

from __future__ import annotations

import asyncio
import copy
import io
import json
import logging
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import discord
from discord import app_commands

# ==========================================================================
# Config
# ==========================================================================
TOKEN = os.getenv("DISCORD_TOKEN", "").strip() or "PASTE_YOUR_BOT_TOKEN_HERE"

BRAND = "Food and b4u"
CURRENCY = "$"
PRICE_DIVISOR = Decimal(3)              # customer pays 1/3 of the order total
MAX_ORDER_TOTAL = Decimal("100000")
CLOSE_DELAY_SECONDS = 5
TICKET_COOLDOWN_SECONDS = 10
DATA_FILE = Path(__file__).with_name("foodandb4u_data.json")

PAYMENT_METHODS = [
    ("Cash App", "💵"), ("PayPal", "🅿️"), ("Venmo", "💙"), ("Zelle", "⚡"),
    ("Apple Pay", "🍎"), ("Crypto", "🪙"), ("Other", "💳"),
]

DEFAULT_RESTAURANTS = [
    ["Huddlehouse", "Church's Chicken", "MCalister Deli", "Lee's Famous Recipe", "Bobevans Farmhouse Kitchen",
     "Playa Bowls", "Panera Bread", "Carl's Jr", "Subway", "Slim Chickens", "Cinnabon", "Mooyah Burgers",
     "Del Taco", "Olive Garden", "P.F Chang's", "Jollibee", "Tropical Smoothie Cafe"],
    ["Steak n' Shake", "Applebees [Half Off]", "Sonic", "Zaxby's", "Red Lobster", "Auntie Anne's", "Dominos",
     "Panda Express", "Five Guys", "Jersey Mike's", "Charleys Cheeseteaks", "Papajohns", "Jamba", "IHOP",
     "Papa Murphys", "The Habit Burger", "Insomnia Cookies"],
    ["Johnny's Pizza", "Smoothie King", "Lee's Chicken", "Bob Evan's", "BJ's Restaurant & Brewhouse",
     "Port Of Subs", "Buffalo Wild Wings", "Cracker Barrel", "Dunkin Donuts (pickup)", "Moe’s", "bonchon",
     "chillis", "daves hot chicken (pickup)", "hardees", "Dairy Queen"],
]
LIST_COLUMN_NAMES = ["🍗 List 1", "🍕 List 2", "🥤 List 3"]

COLOR_GREEN = 0x57F287
COLOR_BLURPLE = 0x5865F2
COLOR_GOLD = 0xF1C40F
COLOR_ORANGE = 0xF39C12
COLOR_RED = 0xED4245
COLOR_BLUE = 0x3498DB
COLOR_DARK = 0x2B2D31

KIND_INFO = {
    "order":   {"prefix": "order",   "title": "🧾 Order Ticket",     "color": COLOR_BLURPLE},
    "vip":     {"prefix": "vip",     "title": "⭐ VIP Order Ticket", "color": COLOR_GOLD},
    "support": {"prefix": "support", "title": "💬 Support Ticket",   "color": COLOR_DARK},
}

INTENT_MESSAGE_CONTENT = (1 << 18) | (1 << 19)   # GATEWAY_MESSAGE_CONTENT | _LIMITED
TYPED_INPUT = True                                # set at startup from the app's intent setting

log = logging.getLogger("foodb4u")


# ==========================================================================
# Storage (JSON file next to main.py)
# ==========================================================================
class Store:
    GUILD_DEFAULTS = {
        "staff_role": None, "chef_role": None, "vip_role": None,
        "category": None, "log_channel": None,
        "panels": [],            # [[channel_id, message_id], ...]
        "clocked_in": {},        # {user_id: unix_since}
        "stats": {},             # {user_id: {"orders": int, "revenue": str, "seconds": int}}
        "orders_completed": 0,
        "completion_seconds": 0, # total claim->complete time, for the average
        "customers": {},         # {user_id: {"orders": int, "spent": str}}
        "blacklist": {},         # {user_id: reason}
        "restaurants": DEFAULT_RESTAURANTS,   # 3 columns shown by /list
        "counter": 0,
    }

    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {}
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text("utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                backup = self.path.with_suffix(".corrupt.json")
                log.error("Could not read %s (%s) - moved to %s", self.path.name, exc, backup.name)
                try:
                    os.replace(self.path, backup)
                except OSError:
                    pass
                self.data = {}
        self.data.setdefault("guilds", {})
        self.data.setdefault("tickets", {})

    def save(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2), "utf-8")
        os.replace(tmp, self.path)

    def guild(self, guild_id: int) -> dict:
        g = self.data["guilds"].setdefault(str(guild_id), {})
        for key, value in self.GUILD_DEFAULTS.items():
            if key not in g:
                g[key] = copy.deepcopy(value)
        if isinstance(g["clocked_in"], list):          # migrate v1 format
            now = int(time.time())
            g["clocked_in"] = {str(uid): now for uid in g["clocked_in"]}
        return g

    def stats(self, guild_id: int, user_id: int) -> dict:
        s = self.guild(guild_id)["stats"].setdefault(str(user_id), {})
        s.setdefault("orders", 0)
        s.setdefault("revenue", "0")
        s.setdefault("seconds", 0)
        s.setdefault("rating_sum", 0)
        s.setdefault("rating_count", 0)
        return s

    def customer(self, guild_id: int, user_id: int) -> dict:
        c = self.guild(guild_id)["customers"].setdefault(str(user_id), {})
        c.setdefault("orders", 0)
        c.setdefault("spent", "0")
        return c

    def ticket(self, channel_id: int) -> Optional[dict]:
        return self.data["tickets"].get(str(channel_id))

    def set_ticket(self, channel_id: int, ticket: dict) -> None:
        self.data["tickets"][str(channel_id)] = ticket
        self.save()

    def delete_ticket(self, channel_id: int) -> None:
        if self.data["tickets"].pop(str(channel_id), None) is not None:
            self.save()

    def tickets(self) -> dict:
        return self.data["tickets"]


store = Store(DATA_FILE)
channel_locks: dict[int, asyncio.Lock] = {}
ticket_cooldowns: dict[int, float] = {}


def lock_for(channel_id: int) -> asyncio.Lock:
    return channel_locks.setdefault(channel_id, asyncio.Lock())


# ==========================================================================
# Helpers
# ==========================================================================
class TicketError(Exception):
    """Validation failure shown to the user as an ephemeral error."""


def mention(user_id) -> str:
    return f"<@{user_id}>" if user_id else "—"


def role_mention(role_id) -> str:
    return f"<@&{role_id}>" if role_id else "*not set*"


def money(value: Decimal) -> str:
    return f"{CURRENCY}{value:,.2f}"


def ts(unix: int, style: str = "R") -> str:
    return f"<t:{int(unix)}:{style}>"


def duration(seconds: int) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m = rem // 60
    return f"{h}h {m}m" if h else f"{m}m"


def progress(step: int, total: int = 4) -> str:
    return "🟩" * step + "⬜" * (total - step) + f"  **Step {step} of {total}**"


def stamp(embed: discord.Embed, extra: Optional[str] = None) -> discord.Embed:
    text = f"{BRAND} • Order Desk" + (f" • {extra}" if extra else "")
    embed.set_footer(text=text)
    embed.timestamp = discord.utils.utcnow()
    return embed


def has_role(member: discord.Member, role_id) -> bool:
    return role_id is not None and any(r.id == role_id for r in member.roles)


def is_owner(member: discord.Member) -> bool:
    """Server owner or administrator."""
    return member.guild.owner_id == member.id or member.guild_permissions.administrator


def is_chef(member: discord.Member, g: dict) -> bool:
    return has_role(member, g["chef_role"])


def can_use_commands(member: discord.Member, g: dict) -> bool:
    return is_owner(member) or is_chef(member, g)


def is_staff(member: discord.Member, g: dict) -> bool:
    """Who may press staff buttons (claim etc.)."""
    return is_owner(member) or is_chef(member, g) or has_role(member, g["staff_role"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-"))
    return slug[:20] or "user"


MONEY_RE = re.compile(r"(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?")


def parse_total(text: str) -> tuple[Optional[Decimal], bool]:
    """Return (amount, ambiguous). Prefers a $-prefixed number; otherwise needs exactly one number."""
    matches = list(MONEY_RE.finditer(text or ""))
    if not matches:
        return None, False
    dollars = [m for m in matches if m.group(1)]
    if dollars:
        pick = dollars[-1]
    elif len(matches) == 1:
        pick = matches[0]
    else:
        return None, True
    raw = pick.group(2).replace(",", "") + ("." + pick.group(3) if pick.group(3) else "")
    try:
        value = Decimal(raw)
    except InvalidOperation:
        return None, False
    if value <= 0 or value > MAX_ORDER_TOTAL:
        return None, False
    return value.quantize(Decimal("0.01")), False


def customer_share(total: Decimal) -> Decimal:
    return (total / PRICE_DIVISOR).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def short_money(value: Decimal) -> str:
    text = money(value)
    return text[:-3] if text.endswith(".00") else text


PRICE_RULE = f"{short_money(customer_share(Decimal(30)))} for every {short_money(Decimal(30))}"   # "$10 for every $30"


def _norm(name: str) -> str:
    name = re.sub(r"[\(\[].*?[\)\]]", "", (name or "").lower())
    return re.sub(r"[^a-z0-9]", "", name)


def menu_match(g: dict, name: Optional[str]) -> Optional[str]:
    """Return the matching restaurant from the /list, or None."""
    n = _norm(name or "")
    if len(n) < 3:
        return None
    for column in g["restaurants"]:
        for item in column:
            i = _norm(item)
            if i and (n == i or (len(n) >= 4 and n in i) or (len(i) >= 4 and i in n)):
                return item
    return None


def restaurant_guess(t: dict) -> str:
    if t.get("restaurant"):
        return t["restaurant"]
    lines = (t.get("address") or "").splitlines()
    return lines[0] if lines else ""


def menu_check_text(t: dict) -> str:
    hit = menu_match(store.guild(t["guild_id"]), restaurant_guess(t))
    return f"✅ **{hit}** is on our list" if hit else "⚠️ Not on our list (`/list`) — a chef will confirm we can do it"


def waiting_orders(guild_id: int) -> list:
    items = [(int(cid), t) for cid, t in store.tickets().items()
             if t["guild_id"] == guild_id and t.get("stage") == "submitted" and not t.get("claimed_by")
             and not t.get("completed")]
    items.sort(key=lambda x: (x[1]["kind"] != "vip", x[1].get("submitted_at") or 0))
    return items


def queue_position(guild_id: int, channel_id: int) -> tuple[Optional[int], int]:
    ids = [cid for cid, _ in waiting_orders(guild_id)]
    return (ids.index(channel_id) + 1 if channel_id in ids else None), len(ids)


IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic")


def is_image(att: discord.Attachment) -> bool:
    return (att.content_type or "").startswith("image/") or att.filename.lower().endswith(IMAGE_EXTS)


def image_attachments(message: discord.Message) -> list[discord.Attachment]:
    return [a for a in message.attachments if is_image(a)]


async def send_error(interaction: discord.Interaction, text: str) -> None:
    embed = stamp(discord.Embed(title="⚠️ Can't do that", description=text, color=COLOR_RED))
    try:
        if interaction.response.is_done():
            await interaction.followup.send(embed=embed, ephemeral=True)
        else:
            await interaction.response.send_message(embed=embed, ephemeral=True)
    except discord.HTTPException:
        pass


async def ack(interaction: discord.Interaction) -> None:
    """Acknowledge before slow work: silent for buttons, ephemeral 'thinking' for slash commands."""
    if interaction.response.is_done():
        return
    if interaction.type == discord.InteractionType.application_command:
        await interaction.response.defer(ephemeral=True, thinking=True)
    else:
        await interaction.response.defer()


async def finish(interaction: discord.Interaction, text: str) -> None:
    if interaction.type == discord.InteractionType.application_command:
        try:
            await interaction.followup.send(text, ephemeral=True)
        except discord.HTTPException:
            pass


def get_ticket_or_fail(channel) -> dict:
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None:
        raise TicketError("This only works inside a ticket channel.")
    return ticket


def location_lines(t: dict) -> str:
    lines = []
    if t.get("restaurant"):
        lines.append(f"🏪 **Restaurant:** {t['restaurant']}")
    lines.append(f"📍 **Address:** {t['address']}")
    if t.get("notes"):
        lines.append(f"📝 **Notes:** {t['notes']}")
    return "\n".join(lines)[:1024]


def payment_text(t: dict) -> str:
    return (t.get("payment") or "—")[:1024]


# ==========================================================================
# Embeds
# ==========================================================================
def panel_embed(guild: Optional[discord.Guild], g: dict) -> discord.Embed:
    online = g["clocked_in"]
    staff_text = "\n".join(f"{mention(uid)} — on since {ts(since)}" for uid, since in online.items()) \
        if online else "*No staff clocked in right now*"
    embed = discord.Embed(
        title=f"🍽️ {BRAND} Order Desk",
        description=(
            "Click **Create Order** below to open a private order ticket with staff.\n\n"
            "🧾 **Create Order** — place a new order\n"
            "💬 **Support** — questions, problems or refunds\n"
            "⭐ **VIP** — priority order queue"
        ),
        color=COLOR_GREEN,
    )
    embed.add_field(name="Status", value="🟢 Open — taking orders", inline=False)
    embed.add_field(name=f"Staff Online ({len(online)})", value=staff_text[:1024], inline=False)
    done = g["orders_completed"]
    avg = duration(g["completion_seconds"] / done) if done else "—"
    rsum = sum(v.get("rating_sum", 0) for v in g["stats"].values())
    rcount = sum(v.get("rating_count", 0) for v in g["stats"].values())
    embed.add_field(name="📦 Orders Completed", value=f"**{done:,}**", inline=True)
    embed.add_field(name="⚡ Avg. Completion", value=avg, inline=True)
    embed.add_field(name="⭐ Customer Rating", value=rating_text(rsum, rcount), inline=True)
    embed.add_field(name="💰 You Pay", value=(
        f"**{PRICE_RULE}** — tax & delivery included\n"
        f"Example: {short_money(Decimal(45))} order → you pay **{short_money(customer_share(Decimal(45)))}** • "
        f"{short_money(Decimal(60))} order → you pay **{short_money(customer_share(Decimal(60)))}**"), inline=False)
    if guild and guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    return stamp(embed)


def welcome_embed(ticket: dict, g: dict, member: Optional[discord.Member] = None) -> discord.Embed:
    info = KIND_INFO[ticket["kind"]]
    embed = discord.Embed(title=f"{info['title']} #{ticket['number']:04d}", color=info["color"])
    if ticket["kind"] == "support":
        embed.description = (
            f"Welcome {mention(ticket['owner_id'])}! 👋\n\n"
            "**Describe your issue below** and a staff member will help you as soon as possible.\n"
            "Include your order number, screenshots, or anything that explains the problem."
        )
    else:
        vip = "\n⭐ **VIP priority** — your order skips the line.\n" if ticket["kind"] == "vip" else ""
        typed = " (or just type your answers in chat)" if TYPED_INPUT else ""
        embed.description = (
            f"Welcome {mention(ticket['owner_id'])}! 👋\n{vip}\n"
            f"Follow the steps below — press the button on each step to fill in a quick form{typed}."
        )
        embed.add_field(
            name="📋 How it works",
            value=(
                "**1.** 🏪 Restaurant + your full address\n"
                "**2.** 📍 Confirm the address is correct\n"
                "**3.** 📸 Order screenshot + total (with tax & delivery)\n"
                f"**4.** 💳 You pay **{PRICE_RULE}** — pick your payment\n"
                "**5.** 🧑‍🍳 A chef claims your order and gets it done ✅"
            ),
            inline=False,
        )
    online = g["clocked_in"]
    embed.add_field(
        name="🟢 Staff Online",
        value=(" ".join(mention(u) for u in online) if online else "*No staff clocked in — someone will be with you soon*")[:1024],
        inline=False,
    )
    if member is not None:
        joined = ts(member.joined_at.timestamp()) if member.joined_at else "—"
        embed.add_field(name="👤 Customer Info", value=(
            f"**Account created:** {ts(member.created_at.timestamp())}\n"
            f"**Joined server:** {joined}\n"
            f"**History:** {customer_history(g, member.id)}"), inline=False)
        embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(name="🕒 Opened", value=ts(ticket["opened_at"], "f"), inline=True)
    embed.add_field(name="🎫 Ticket ID", value=f"`#{ticket['number']:04d}`", inline=True)
    embed.add_field(name="🔒 Done?", value="Press **Close Ticket** below.", inline=True)
    return stamp(embed, f"Ticket #{ticket['number']:04d}")


def step_address_embed(retry: bool = False) -> discord.Embed:
    typed = "\n\n💬 You can also **type it in one message** below." if TYPED_INPUT else ""
    if retry:
        embed = discord.Embed(
            title="✏️ Retype Your Address",
            description=(f"{progress(1)}\n\nNo problem! Press **Enter Restaurant & Address** and send me "
                         f"the **correct** restaurant and full address.{typed}"),
            color=COLOR_ORANGE,
        )
    else:
        embed = discord.Embed(
            title="🏪 Step 1 — Restaurant & Address",
            description=(f"{progress(1)}\n\n**What's the restaurant and your full address?**\n"
                         f"Press **Enter Restaurant & Address** below.{typed}"),
            color=COLOR_BLURPLE,
        )
    embed.add_field(name="📝 Example",
                    value="```\nChipotle\n123 Main St, Apt 4B, Springfield, IL 62704\n```", inline=False)
    embed.add_field(name="💡 Tip",
                    value="Include apartment / unit number, city, state and ZIP so nothing goes wrong.", inline=False)
    return stamp(embed, "Step 1/4")


def step_confirm_embed(t: dict) -> discord.Embed:
    embed = discord.Embed(
        title="📍 Step 2 — Are you correct?",
        description=f"{progress(2)}\n\nDouble-check everything below, then press **Yes** or **No**.",
        color=COLOR_GOLD,
    )
    embed.add_field(name="🏠 Delivery Details", value=location_lines(t), inline=False)
    embed.add_field(name="📋 Restaurant Check", value=menu_check_text(t), inline=False)
    embed.add_field(name="❓ What next",
                    value="✅ **Yes** — continue to the order screenshot\n❌ **No** — retype your address",
                    inline=False)
    return stamp(embed, "Step 2/4")


def step_screenshot_embed() -> discord.Embed:
    typed = ("\n\n💬 You can also **attach the screenshot and type the total** in chat "
             "(same message or one after the other).") if TYPED_INPUT else ""
    embed = discord.Embed(
        title="🧾 Step 3 — Order Screenshot & Total",
        description=(f"{progress(3)}\n\nSend me the **screenshot of the order** and the "
                     f"**order total with tax and delivery**.\nPress **Upload Screenshot & Total** below.{typed}"),
        color=COLOR_BLURPLE,
    )
    embed.add_field(name="📸 Screenshot", value="Your cart / checkout page showing the items and total.", inline=True)
    embed.add_field(name="💲 Total", value="Example: `$30.00`", inline=True)
    return stamp(embed, "Step 3/4")


def step_payment_embed(total: Decimal, due: Decimal) -> discord.Embed:
    typed = "\n💬 Or just **type your payment method** in chat." if TYPED_INPUT else ""
    embed = discord.Embed(
        title="💵 Step 4 — Payment",
        description=(f"{progress(4)}\n\n# Your order is {money(due)}\n"
                     f"**What payment are you using?** Press **Choose Payment** below.{typed}"),
        color=COLOR_GREEN,
    )
    embed.add_field(name="🧾 Order Total", value=money(total), inline=True)
    embed.add_field(name=f"✂️ You Pay ({PRICE_RULE})", value=f"**{money(due)}**", inline=True)
    embed.add_field(name="💰 You Save", value=money(total - due), inline=True)
    embed.add_field(name="💳 Accepted", value=" • ".join(f"{e} {n}" for n, e in PAYMENT_METHODS), inline=False)
    return stamp(embed, "Step 4/4")


def summary_embed(t: dict, image_name: Optional[str]) -> discord.Embed:
    vip = t["kind"] == "vip"
    embed = discord.Embed(
        title=("⭐ VIP " if vip else "") + "🧑‍🍳 New Order — Ready for a Chef",
        description=f"Order **#{t['number']:04d}** from {mention(t['owner_id'])} has been sent to the kitchen. 🔥",
        color=COLOR_GOLD if vip else COLOR_ORANGE,
    )
    embed.add_field(name="👤 Customer", value=mention(t["owner_id"]), inline=True)
    embed.add_field(name="🆔 Order", value=f"#{t['number']:04d}", inline=True)
    embed.add_field(name="⭐ Priority", value="**VIP**" if vip else "Standard", inline=True)
    embed.add_field(name="🏠 Delivery Details", value=location_lines(t), inline=False)
    embed.add_field(name="📋 Restaurant Check", value=menu_check_text(t), inline=False)
    embed.add_field(name="🧾 Order Total", value=money(Decimal(t["total"])), inline=True)
    embed.add_field(name="💵 Customer Pays", value=f"**{money(Decimal(t['due']))}**", inline=True)
    embed.add_field(name="💳 Payment", value=payment_text(t), inline=True)
    embed.add_field(name="💰 Payment Status", value=paid_text(t), inline=True)
    embed.add_field(name="👥 Customer History", value=customer_history(store.guild(t["guild_id"]), t["owner_id"]),
                    inline=True)
    embed.add_field(name="🕒 Opened", value=ts(t["opened_at"]), inline=True)
    embed.add_field(name="📌 Status", value=order_status(t), inline=False)
    embed.add_field(name="🧭 Timeline", value=timeline_text(t), inline=False)
    if image_name:
        embed.set_image(url=f"attachment://{image_name}")
    return stamp(embed, f"Order #{t['number']:04d}")


def order_status(t: dict) -> str:
    chef = mention(t.get("claimed_by"))
    if t.get("completed"):
        return f"✅ Completed by {chef}"
    if t.get("onway_at"):
        return f"🚗 Out for delivery — handled by {chef}"
    if t.get("placed_at"):
        return f"🛒 Order placed by {chef}"
    if t.get("claimed_by"):
        return f"🔵 Claimed by {chef} — cooking now 🍳"
    return "🟠 Waiting for a chef to **claim** this order"


TIMELINE = [
    ("submitted_at", "📨 Submitted"), ("claimed_at", "🙋 Claimed"), ("paid_at", "💰 Payment received"),
    ("placed_at", "🛒 Order placed"), ("onway_at", "🚗 Out for delivery"), ("completed_at", "✅ Completed"),
]


def timeline_text(t: dict) -> str:
    return "\n".join(f"{'🟢' if t.get(k) else '⚪'} {label}" + (f" — {ts(t[k])}" if t.get(k) else "")
                     for k, label in TIMELINE)


def paid_text(t: dict) -> str:
    return f"✅ Received {ts(t['paid_at'])}" if t.get("paid_at") else "⏳ Not received yet"


def stars(n: int) -> str:
    return "⭐" * n + "☆" * (5 - n)


def rating_text(rsum: int, rcount: int) -> str:
    return f"⭐ {rsum / rcount:.1f}/5 ({rcount})" if rcount else "*no ratings yet*"


def customer_history(g: dict, user_id: int) -> str:
    c = g["customers"].get(str(user_id))
    if not c or not c.get("orders"):
        return "🆕 First order"
    return f"🔁 Returning — **{c['orders']}** order(s) • {money(Decimal(c['spent']))} paid"


def note(text: str, color: int = COLOR_ORANGE, extra: Optional[str] = None) -> discord.Embed:
    return stamp(discord.Embed(description=text, color=color), extra)


# ==========================================================================
# Modals (pop-up forms) - work without the Message Content intent
# ==========================================================================
class AddressModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="🏪 Restaurant & Address", timeout=900)
        self.restaurant = discord.ui.TextInput(placeholder="e.g. Chipotle", max_length=100)
        self.address = discord.ui.TextInput(style=discord.TextStyle.paragraph, min_length=5, max_length=500,
                                            placeholder="Street, Apt/Unit, City, State, ZIP")
        self.notes = discord.ui.TextInput(style=discord.TextStyle.paragraph, required=False, max_length=300,
                                          placeholder="Gate code, leave at door, call on arrival… (optional)")
        self.add_item(discord.ui.Label(text="Restaurant", description="Which restaurant are you ordering from?",
                                       component=self.restaurant))
        self.add_item(discord.ui.Label(text="Full delivery address", description="Include unit number and ZIP",
                                       component=self.address))
        self.add_item(discord.ui.Label(text="Delivery notes", description="Anything the driver should know",
                                       component=self.notes))

    async def on_submit(self, interaction: discord.Interaction):
        await submit_address_interaction(interaction, self.restaurant.value.strip(),
                                         self.address.value.strip(), self.notes.value.strip())

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("AddressModal failed", exc_info=error)
        await send_error(interaction, "Something went wrong saving your address. Please try again.")


class ScreenshotModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="📸 Order Screenshot & Total", timeout=900)
        self.shot = discord.ui.FileUpload(required=True, min_values=1, max_values=1)
        self.total = discord.ui.TextInput(placeholder="$30.00", max_length=20)
        self.add_item(discord.ui.Label(text="Order screenshot",
                                       description="Screenshot of your cart / checkout with the items and total",
                                       component=self.shot))
        self.add_item(discord.ui.Label(text="Order total (with tax & delivery)",
                                       description="Just the number, e.g. 30.00", component=self.total))

    async def on_submit(self, interaction: discord.Interaction):
        await submit_screenshot_interaction(interaction, self.shot.values, self.total.value)

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("ScreenshotModal failed", exc_info=error)
        await send_error(interaction, "Something went wrong with your upload. Please try again.")


class PaymentModal(discord.ui.Modal):
    def __init__(self, due: str):
        super().__init__(title=f"💳 Payment — {money(Decimal(due))}", timeout=900)
        self.method = discord.ui.Select(
            placeholder="Choose a payment method",
            options=[discord.SelectOption(label=n, emoji=e, value=n) for n, e in PAYMENT_METHODS],
        )
        self.details = discord.ui.TextInput(required=False, max_length=100,
                                            placeholder="Your $cashtag / @username / which coin (optional)")
        self.add_item(discord.ui.Label(text="Payment method", description="How are you paying?",
                                       component=self.method))
        self.add_item(discord.ui.Label(text="Payment name / details",
                                       description="Required if you picked Other", component=self.details))

    async def on_submit(self, interaction: discord.Interaction):
        method = self.method.values[0] if self.method.values else ""
        details = self.details.value.strip()
        if method == "Other" and not details:
            return await send_error(interaction, "You picked **Other** — tell us which payment method in the details box.")
        emoji = dict(PAYMENT_METHODS).get(method, "💳")
        text = f"{emoji} {method}" + (f" — {details}" if details else "")
        await submit_payment_interaction(interaction, text)

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("PaymentModal failed", exc_info=error)
        await send_error(interaction, "Something went wrong saving your payment. Please try again.")


# ==========================================================================
# Views (persistent: keep working after a restart)
# ==========================================================================
def list_embed(guild: Optional[discord.Guild], g: dict) -> discord.Embed:
    columns = g["restaurants"]
    count = sum(len(c) for c in columns)
    embed = discord.Embed(
        title=f"🍽️ {BRAND} — Restaurant List",
        description=(f"Here's every spot we can order from right now. 🔥\n"
                     f"💸 You pay **{PRICE_RULE}** — tax & delivery included.\n"
                     f"🧾 Press **Create Order** below to start, or **🧮 Price Calculator** to see your price."),
        color=COLOR_GREEN,
    )
    for i, column in enumerate(columns):
        name = LIST_COLUMN_NAMES[i] if i < len(LIST_COLUMN_NAMES) else f"📋 List {i + 1}"
        chunk = ""
        for item in column:
            line = f"• {item}\n"
            if len(chunk) + len(line) > 1000:
                embed.add_field(name=name, value=chunk, inline=True)
                name, chunk = "​", ""
            chunk += line
        embed.add_field(name=name, value=chunk or "—", inline=True)
    if guild and guild.icon:
        embed.set_thumbnail(url=guild.icon.url)
    return stamp(embed, f"{count} restaurants")


def price_embed(amount: Decimal) -> discord.Embed:
    due = customer_share(amount)
    embed = discord.Embed(title="🧮 Price Calculator",
                          description=f"# You pay {money(due)}\nfor a **{money(amount)}** order ({PRICE_RULE}).",
                          color=COLOR_GREEN)
    embed.add_field(name="🧾 Order Total", value=money(amount), inline=True)
    embed.add_field(name="💵 You Pay", value=f"**{money(due)}**", inline=True)
    embed.add_field(name="💰 You Save", value=money(amount - due), inline=True)
    embed.add_field(name="🚀 Ready?", value="Press **Create Order** to open your ticket.", inline=False)
    return stamp(embed)


class CalcModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="🧮 Price Calculator", timeout=600)
        self.total = discord.ui.TextInput(placeholder="$30.00", max_length=20)
        self.add_item(discord.ui.Label(text="Your order total (with tax & delivery)",
                                       description=f"We'll show what you pay — {PRICE_RULE}", component=self.total))

    async def on_submit(self, interaction: discord.Interaction):
        amount, ambiguous = parse_total(self.total.value)
        if amount is None:
            return await send_error(interaction, "Type **just the total**, like `30.00`." if ambiguous
                                    else "I couldn't read that total. Type it like `30.00`.")
        await interaction.response.send_message(embed=price_embed(amount), ephemeral=True)

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("CalcModal failed", exc_info=error)
        await send_error(interaction, "Something went wrong. Please try again.")


async def show_list(interaction: discord.Interaction) -> None:
    if interaction.guild is None:
        return await send_error(interaction, "This only works inside a server.")
    await interaction.response.send_message(embed=list_embed(interaction.guild, store.guild(interaction.guild.id)),
                                            ephemeral=True)


class SafeView(discord.ui.View):
    """Base view: any unexpected error is logged and shown to the user."""

    async def on_error(self, interaction: discord.Interaction, error: Exception, item) -> None:
        log.error("Button %s failed", getattr(item, "custom_id", item), exc_info=error)
        await send_error(interaction, "Something went wrong with that button. Please try again — "
                                      "if it keeps happening, ping the owner.")


class PanelView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Create Order", emoji="🧾", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:panel:order")
    async def create_order(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "order")

    @discord.ui.button(label="Support", emoji="💬", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:panel:support")
    async def support(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "support")

    @discord.ui.button(label="VIP", emoji="⭐", style=discord.ButtonStyle.danger,
                       custom_id="fb4u:panel:vip")
    async def vip(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "vip")

    @discord.ui.button(label="Restaurants", emoji="📋", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:panel:list", row=1)
    async def restaurants(self, interaction: discord.Interaction, button: discord.ui.Button):
        await show_list(interaction)

    @discord.ui.button(label="Price Calculator", emoji="🧮", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:panel:calc", row=1)
    async def calc(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(CalcModal())


class ListView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Create Order", emoji="🧾", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:list:order")
    async def create_order(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "order")

    @discord.ui.button(label="Price Calculator", emoji="🧮", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:list:calc")
    async def calc(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.send_modal(CalcModal())


class TicketControlView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Close Ticket", emoji="🔒", style=discord.ButtonStyle.danger,
                       custom_id="fb4u:ticket:close")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            check_close_allowed(interaction.channel, interaction.user)
        except TicketError as exc:
            return await send_error(interaction, str(exc))
        embed = discord.Embed(
            title="🔒 Close this ticket?",
            description="The channel will be **deleted** and a transcript saved to the log channel.\nThis can't be undone.",
            color=COLOR_RED,
        )
        await interaction.response.send_message(embed=stamp(embed), view=CloseConfirmView(), ephemeral=True)


class CloseConfirmView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Yes, close it", emoji="🔒", style=discord.ButtonStyle.danger,
                       custom_id="fb4u:close:yes")
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content="Closing…", embed=None, view=None)
        try:
            await close_ticket(interaction.channel, interaction.user, reason="Closed with button")
        except TicketError as exc:
            await send_error(interaction, str(exc))

    @discord.ui.button(label="Cancel", emoji="✖️", style=discord.ButtonStyle.secondary, custom_id="fb4u:close:no")
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content="Cancelled — ticket stays open.", embed=None, view=None)


class DoneView(SafeView):
    """Disabled marker that replaces a finished step's button."""

    def __init__(self, label: str = "Done"):
        super().__init__(timeout=1)
        self.add_item(discord.ui.Button(label=label, emoji="✅", style=discord.ButtonStyle.secondary, disabled=True))


async def step_guard(interaction: discord.Interaction, stage: str) -> Optional[dict]:
    ticket = store.ticket(interaction.channel.id) if interaction.channel else None
    if ticket is None:
        await send_error(interaction, "This ticket no longer exists.")
        return None
    if interaction.user.id != ticket["owner_id"] and not is_owner(interaction.user):
        await send_error(interaction, "Only the customer who opened this ticket can fill this in.")
        return None
    if ticket["stage"] != stage:
        await send_error(interaction, "This step is already done — check the latest message below.")
        return None
    return ticket


class AddressStepView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Enter Restaurant & Address", emoji="📝", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:step:address")
    async def enter(self, interaction: discord.Interaction, button: discord.ui.Button):
        if await step_guard(interaction, "address"):
            await interaction.response.send_modal(AddressModal())


class ShotStepView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Upload Screenshot & Total", emoji="📸", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:step:shot")
    async def upload(self, interaction: discord.Interaction, button: discord.ui.Button):
        if await step_guard(interaction, "screenshot"):
            await interaction.response.send_modal(ScreenshotModal())


class PayStepView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Choose Payment", emoji="💳", style=discord.ButtonStyle.success,
                       custom_id="fb4u:step:pay")
    async def pay(self, interaction: discord.Interaction, button: discord.ui.Button):
        ticket = await step_guard(interaction, "payment")
        if ticket:
            await interaction.response.send_modal(PaymentModal(ticket["due"]))


class AddressConfirmView(SafeView):
    def __init__(self, disabled: bool = False):
        super().__init__(timeout=None)
        if disabled:
            self.yes.disabled = True
            self.no.disabled = True

    @discord.ui.button(label="Yes, that's correct", emoji="✅", style=discord.ButtonStyle.success,
                       custom_id="fb4u:order:addr_yes")
    async def yes(self, interaction: discord.Interaction, button: discord.ui.Button):
        await answer_address(interaction, correct=True)

    @discord.ui.button(label="No, retype it", emoji="❌", style=discord.ButtonStyle.danger,
                       custom_id="fb4u:order:addr_no")
    async def no(self, interaction: discord.Interaction, button: discord.ui.Button):
        await answer_address(interaction, correct=False)


class ClaimView(SafeView):
    def __init__(self, claimed: bool = False, done: bool = False):
        super().__init__(timeout=None)
        if done:
            self.claim.disabled = True
            self.claim.label = "Completed"
            self.claim.emoji = "✅"
            self.claim.style = discord.ButtonStyle.secondary
        elif claimed:
            self.claim.disabled = True
            self.claim.label = "Claimed"
            self.claim.style = discord.ButtonStyle.secondary

    @discord.ui.button(label="Claim Order", emoji="🙋", style=discord.ButtonStyle.success,
                       custom_id="fb4u:order:claim")
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_claim(interaction)


class ClaimedView(SafeView):
    """Chef controls: progress the order step by step, unclaim, or complete."""

    def __init__(self, ticket: Optional[dict] = None, disabled: bool = False):
        super().__init__(timeout=None)
        t = ticket or {}
        if t.get("kind") == "support":
            for item in (self.paid, self.placed, self.onway):
                self.remove_item(item)
        if disabled:
            for item in self.children:
                item.disabled = True
            return
        for key, button, done_label in (("paid_at", self.paid, "Paid"), ("placed_at", self.placed, "Placed"),
                                        ("onway_at", self.onway, "On The Way")):
            if t.get(key):
                button.disabled = True
                button.label = done_label
                button.style = discord.ButtonStyle.secondary

    @discord.ui.button(label="Payment Received", emoji="💰", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:order:paid", row=0)
    async def paid(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_progress(interaction, "paid")

    @discord.ui.button(label="Order Placed", emoji="🛒", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:order:placed", row=0)
    async def placed(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_progress(interaction, "placed")

    @discord.ui.button(label="On The Way", emoji="🚗", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:order:onway", row=0)
    async def onway(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_progress(interaction, "onway")

    @discord.ui.button(label="Unclaim", emoji="↩️", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:order:unclaim", row=1)
    async def unclaim(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_unclaim(interaction)

    @discord.ui.button(label="Mark Complete", emoji="✅", style=discord.ButtonStyle.success,
                       custom_id="fb4u:order:complete", row=1)
    async def complete(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_complete(interaction)


class RateView(SafeView):
    """Customer rates the finished order 1-5 stars."""

    def __init__(self, chosen: int = 0):
        super().__init__(timeout=None)
        if chosen:
            for item in self.children:
                item.disabled = True
                if item.custom_id == f"fb4u:rate:{chosen}":
                    item.style = discord.ButtonStyle.success

    @discord.ui.button(label="1", emoji="⭐", style=discord.ButtonStyle.secondary, custom_id="fb4u:rate:1")
    async def r1(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_rate(interaction, 1)

    @discord.ui.button(label="2", emoji="⭐", style=discord.ButtonStyle.secondary, custom_id="fb4u:rate:2")
    async def r2(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_rate(interaction, 2)

    @discord.ui.button(label="3", emoji="⭐", style=discord.ButtonStyle.secondary, custom_id="fb4u:rate:3")
    async def r3(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_rate(interaction, 3)

    @discord.ui.button(label="4", emoji="⭐", style=discord.ButtonStyle.secondary, custom_id="fb4u:rate:4")
    async def r4(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_rate(interaction, 4)

    @discord.ui.button(label="5", emoji="⭐", style=discord.ButtonStyle.secondary, custom_id="fb4u:rate:5")
    async def r5(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_rate(interaction, 5)


PERSISTENT_VIEWS = (PanelView, ListView, CloseConfirmView, TicketControlView, AddressStepView, ShotStepView, PayStepView,
                    AddressConfirmView, ClaimView, ClaimedView, RateView)


# ==========================================================================
# Panels
# ==========================================================================
async def refresh_panels(guild: discord.Guild) -> None:
    g = store.guild(guild.id)
    keep = []
    for channel_id, message_id in g["panels"]:
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            continue
        try:
            await channel.get_partial_message(message_id).edit(embed=panel_embed(guild, g), view=PanelView())
            keep.append([channel_id, message_id])
        except discord.NotFound:
            continue
        except discord.HTTPException as exc:
            log.warning("Could not update panel %s/%s: %s", channel_id, message_id, exc)
            keep.append([channel_id, message_id])
    if keep != g["panels"]:
        g["panels"] = keep
        store.save()


# ==========================================================================
# Ticket creation
# ==========================================================================
def member_overwrite() -> discord.PermissionOverwrite:
    return discord.PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True,
                                       embed_links=True, read_message_history=True)


def staff_overwrite(can_send: bool) -> discord.PermissionOverwrite:
    return discord.PermissionOverwrite(view_channel=True, send_messages=can_send, attach_files=can_send,
                                       embed_links=can_send, read_message_history=True)


async def open_ticket(interaction: discord.Interaction, kind: str) -> None:
    guild, member = interaction.guild, interaction.user
    if guild is None or not isinstance(member, discord.Member):
        return await send_error(interaction, "Tickets can only be opened inside a server.")

    g = store.guild(guild.id)
    category = guild.get_channel(g["category"]) if g["category"] else None
    if not isinstance(category, discord.CategoryChannel) or not g["staff_role"]:
        return await send_error(interaction, "The ticket system isn't set up yet. The server owner needs to run `/ticket`.")

    if str(member.id) in g["blacklist"]:
        return await send_error(interaction, "🚫 You're blocked from opening tickets here.\n"
                                             f"**Reason:** {g['blacklist'][str(member.id)]}")

    if kind == "vip" and g["vip_role"] and not has_role(member, g["vip_role"]) and not is_owner(member):
        return await send_error(interaction, f"⭐ VIP tickets are only for {role_mention(g['vip_role'])}.\n"
                                             "Use **Create Order** instead.")

    for cid, t in store.tickets().items():
        if t["guild_id"] == guild.id and t["owner_id"] == member.id and t["kind"] == kind and guild.get_channel(int(cid)):
            return await send_error(interaction, f"You already have an open {kind} ticket: <#{cid}>")

    wait = ticket_cooldowns.get(member.id, 0) + TICKET_COOLDOWN_SECONDS - time.monotonic()
    if wait > 0:
        return await send_error(interaction, f"Slow down! Try again in **{wait:.0f}s**.")
    ticket_cooldowns[member.id] = time.monotonic()

    await interaction.response.defer(ephemeral=True, thinking=True)

    g["counter"] += 1
    number = g["counter"]
    store.save()

    info = KIND_INFO[kind]
    overwrites: dict = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        member: member_overwrite(),
        guild.me: member_overwrite(),
    }
    for role_id in (g["staff_role"], g["chef_role"]):
        role = guild.get_role(role_id) if role_id else None
        if role:
            overwrites[role] = staff_overwrite(True)

    try:
        channel = await guild.create_text_channel(
            name=f"{info['prefix']}-{number:04d}-{slugify(member.name)}",
            category=category, overwrites=overwrites,
            topic=f"{info['title']} #{number:04d} • opened by {member} ({member.id})",
            reason=f"{BRAND} ticket opened by {member}",
        )
    except discord.Forbidden:
        return await interaction.followup.send(
            "❌ I can't create channels in that category. Give my role **Administrator** "
            "(or Manage Channels + Manage Roles).", ephemeral=True)
    except discord.HTTPException as exc:
        return await interaction.followup.send(f"❌ Discord error while creating the ticket: {exc}", ephemeral=True)

    ticket = {
        "guild_id": guild.id, "owner_id": member.id, "kind": kind, "number": number,
        "stage": "support" if kind == "support" else "address",
        "restaurant": None, "address": None, "notes": None,
        "total": None, "due": None, "screenshot_msg_id": None, "payment": None,
        "claimed_by": None, "claimed_at": None, "completed": False,
        "step_msg_id": None, "confirm_msg_id": None, "summary_msg_id": None, "claim_msg_id": None,
        "opened_at": int(time.time()), "submitted_at": None,
    }
    store.set_ticket(channel.id, ticket)

    await channel.send(content=member.mention, embed=welcome_embed(ticket, g, member), view=TicketControlView(),
                       allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
    if kind != "support":
        await send_step(channel, ticket, step_address_embed(), AddressStepView())

    done = discord.Embed(title="✅ Ticket Created",
                         description=f"Your ticket is ready: {channel.mention}\nHead over there to continue.",
                         color=COLOR_GREEN)
    await interaction.followup.send(embed=stamp(done), ephemeral=True)


# ==========================================================================
# Order flow
# ==========================================================================
async def send_step(channel: discord.TextChannel, ticket: dict, embed: discord.Embed, view: discord.ui.View) -> None:
    msg = await channel.send(embed=embed, view=view)
    ticket["step_msg_id"] = msg.id
    ticket["hinted"] = None
    store.set_ticket(channel.id, ticket)


async def retire_step(channel: discord.TextChannel, ticket: dict, label: str = "Done") -> None:
    mid = ticket.get("step_msg_id")
    ticket["step_msg_id"] = None
    if mid:
        try:
            await channel.get_partial_message(mid).edit(view=DoneView(label))
        except discord.HTTPException:
            pass


async def apply_address(channel, ticket: dict, restaurant: Optional[str], address: str, notes: Optional[str]) -> None:
    await retire_step(channel, ticket, "Address received")
    ticket.update(restaurant=restaurant or None, address=address, notes=notes or None, stage="confirm")
    msg = await channel.send(embed=step_confirm_embed(ticket), view=AddressConfirmView())
    ticket["confirm_msg_id"] = msg.id
    store.set_ticket(channel.id, ticket)


async def apply_screenshot_and_total(channel, ticket: dict) -> None:
    await retire_step(channel, ticket, "Screenshot & total received")
    total = Decimal(ticket["total"])
    due = customer_share(total)
    ticket.update(due=str(due), stage="payment")
    await send_step(channel, ticket, step_payment_embed(total, due), PayStepView())


async def apply_payment(channel, ticket: dict, payment: str) -> None:
    await retire_step(channel, ticket, "Payment received")
    ticket.update(payment=payment[:200], stage="submitted", submitted_at=int(time.time()))
    store.set_ticket(channel.id, ticket)
    await send_order_summary(channel, ticket)


async def submit_address_interaction(interaction, restaurant: str, address: str, notes: str) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = await step_guard(interaction, "address")
        if not ticket:
            return
        await apply_address(channel, ticket, restaurant, address, notes)


async def submit_screenshot_interaction(interaction, uploads: list, total_text: str) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = await step_guard(interaction, "screenshot")
        if not ticket:
            return
        images = [a for a in uploads if is_image(a)]
        if not images:
            return await send_error(interaction, "That file isn't an image. Upload a **screenshot** (PNG/JPG).")
        amount, ambiguous = parse_total(total_text)
        if amount is None:
            hint = "Type **just the total**, like `30.00`." if ambiguous else "I couldn't read that total. Type it like `30.00`."
            return await send_error(interaction, hint)

        att = images[0]
        ext = os.path.splitext(att.filename)[1].lower() or ".png"
        embed = discord.Embed(title="📸 Order Screenshot",
                              description=f"Uploaded by {interaction.user.mention} • Total entered: **{money(amount)}**",
                              color=COLOR_BLURPLE)
        try:
            file = await att.to_file(filename=f"order_screenshot{ext}")
            embed.set_image(url=f"attachment://{file.filename}")
            msg = await channel.send(embed=stamp(embed, "Step 3/4"), file=file)
        except discord.HTTPException as exc:
            log.warning("Screenshot re-upload failed: %s", exc)
            return await interaction.followup.send(
                embed=note("⚠️ I couldn't save that image (too big?). Try a smaller screenshot.", COLOR_RED),
                ephemeral=True)
        ticket.update(screenshot_msg_id=msg.id, total=str(amount))
        await apply_screenshot_and_total(channel, ticket)


async def submit_payment_interaction(interaction, payment: str) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = await step_guard(interaction, "payment")
        if not ticket:
            return
        await apply_payment(channel, ticket, payment)


async def handle_typed_message(message: discord.Message, ticket: dict) -> None:
    """Typed-answer path (only when the Message Content intent is enabled)."""
    channel, stage, text = message.channel, ticket["stage"], message.content.strip()

    if stage == "address":
        if len(text) < 5:
            await channel.send(embed=note("✍️ Please **type** the restaurant and your full address in one message, "
                                          "or press **Enter Restaurant & Address** above."))
            return
        if len(text) > 1000:
            await channel.send(embed=note("✂️ That's too long — keep it under 1000 characters."))
            return
        await apply_address(channel, ticket, None, text, None)

    elif stage == "screenshot":
        images = image_attachments(message)
        if images:
            ticket["screenshot_msg_id"] = message.id
        amount, ambiguous = parse_total(text) if text else (None, False)
        if amount is not None:
            ticket["total"] = str(amount)
        store.set_ticket(channel.id, ticket)

        if ticket["screenshot_msg_id"] and ticket["total"]:
            await apply_screenshot_and_total(channel, ticket)
            return
        if not images and amount is None:
            if ambiguous:
                hint = "I found more than one number. Send **just the total**, like `$30.00`."
            elif text:
                hint = "I couldn't read an order total from that. Type it like `$30.00`."
            else:
                hint = "Please attach your **order screenshot** and type the **total**."
            await channel.send(embed=note(f"⚠️ {hint}", extra="Step 3/4"))
        elif ticket["screenshot_msg_id"]:
            await channel.send(embed=note("📸 Got your screenshot! Now **type the order total** with tax & delivery "
                                          "(e.g. `$30.00`).", COLOR_BLURPLE, "Step 3/4"))
        else:
            await channel.send(embed=note(f"💲 Got your total (**{money(Decimal(ticket['total']))}**)! "
                                          "Now **send the screenshot** of the order.", COLOR_BLURPLE, "Step 3/4"))

    elif stage == "payment":
        if not text:
            await channel.send(embed=note("💳 Please **type** your payment method (e.g. Cash App) "
                                          "or press **Choose Payment** above."))
            return
        await apply_payment(channel, ticket, f"💳 {text}")


async def send_order_summary(channel: discord.TextChannel, ticket: dict) -> None:
    g = store.guild(channel.guild.id)
    ping_role = g["chef_role"] or g["staff_role"]
    head = "🔔 **New order ready to be claimed!**" + (" ⭐ **VIP**" if ticket["kind"] == "vip" else "")
    content = f"{role_mention(ping_role)} {head}" if ping_role else head
    allowed = discord.AllowedMentions(roles=True, users=False, everyone=False)

    file: Optional[discord.File] = None
    jump: Optional[str] = None
    try:
        shot_msg = await channel.fetch_message(ticket["screenshot_msg_id"])
        jump = shot_msg.jump_url
        images = image_attachments(shot_msg)
        if images:
            att = images[0]
            ext = os.path.splitext(att.filename)[1].lower() or ".png"
            file = await att.to_file(filename=f"order_screenshot{ext}")
    except discord.HTTPException as exc:
        log.warning("Could not fetch screenshot in %s: %s", channel.id, exc)

    msg = None
    if file:
        try:
            msg = await channel.send(content=content, embed=summary_embed(ticket, file.filename),
                                     file=file, view=ClaimView(), allowed_mentions=allowed)
        except discord.HTTPException as exc:
            log.warning("Summary re-upload failed (%s); sending link instead", exc)
    if msg is None:
        embed = summary_embed(ticket, None)
        embed.add_field(name="📸 Screenshot",
                        value=f"[Jump to screenshot]({jump})" if jump else "*Screenshot unavailable*", inline=False)
        msg = await channel.send(content=content, embed=embed, view=ClaimView(), allowed_mentions=allowed)

    ticket["summary_msg_id"] = msg.id
    store.set_ticket(channel.id, ticket)
    pos, total_waiting = queue_position(channel.guild.id, channel.id)
    queue = (f"\n📍 You're **#{pos}** of {total_waiting} in the queue"
             + (" — ⭐ VIP orders go first." if ticket["kind"] != "vip" else " — ⭐ VIP priority.")) if pos else ""
    online = len(g["clocked_in"])
    staff = f"\n🟢 **{online}** staff online right now." if online else "\n🕒 No staff clocked in — we'll be with you ASAP."
    await channel.send(embed=note(
        f"✅ {mention(ticket['owner_id'])} your order was sent to the kitchen!\n"
        f"Send **{money(Decimal(ticket['due']))}** with **{payment_text(ticket)}** when a chef claims it."
        + queue + staff,
        COLOR_GREEN, f"Order #{ticket['number']:04d}"))


async def answer_address(interaction: discord.Interaction, correct: bool) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = await step_guard(interaction, "confirm")
        if not ticket:
            return
        if interaction.message.id != ticket["confirm_msg_id"]:
            return await send_error(interaction, "This question was already answered.")

        embed = step_confirm_embed(ticket)
        embed.color = COLOR_GREEN if correct else COLOR_RED
        embed.set_field_at(len(embed.fields) - 1, name="📌 Answer",
                           value="✅ Confirmed" if correct else "❌ Rejected — retyping", inline=False)
        await interaction.message.edit(embed=embed, view=AddressConfirmView(disabled=True))
        ticket["confirm_msg_id"] = None

        if correct:
            ticket.update(stage="screenshot", screenshot_msg_id=None, total=None)
            await send_step(channel, ticket, step_screenshot_embed(), ShotStepView())
        else:
            ticket.update(stage="address", restaurant=None, address=None, notes=None)
            await send_step(channel, ticket, step_address_embed(retry=True), AddressStepView())


# ==========================================================================
# Claim / Unclaim / Complete / Close
# ==========================================================================
async def update_summary(channel, ticket: dict, view: discord.ui.View) -> None:
    if not ticket.get("summary_msg_id"):
        return
    live = {"📌 Status": order_status(ticket), "🧭 Timeline": timeline_text(ticket),
            "💰 Payment Status": paid_text(ticket)}
    try:
        msg = await channel.fetch_message(ticket["summary_msg_id"])
        if not msg.embeds:
            return
        embed = msg.embeds[0]
        for i, field in enumerate(embed.fields):
            if field.name in live:
                embed.set_field_at(i, name=field.name, value=live[field.name], inline=field.inline)
        if ticket.get("completed"):
            embed.color = COLOR_GREEN
        await msg.edit(embed=embed, view=view)
    except discord.HTTPException as exc:
        log.warning("Summary update failed in %s: %s", channel.id, exc)


async def disable_claim_message(channel, ticket: dict) -> None:
    if ticket.get("claim_msg_id"):
        try:
            await channel.get_partial_message(ticket["claim_msg_id"]).edit(view=ClaimedView(disabled=True))
        except discord.HTTPException:
            pass
    ticket["claim_msg_id"] = None


async def do_claim(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    await ack(interaction)
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            g = store.guild(channel.guild.id)
            if not is_staff(member, g):
                raise TicketError(f"Only {role_mention(g['chef_role'] or g['staff_role'])} or the owner can claim orders.")
            if ticket["completed"]:
                raise TicketError("This order is already completed.")
            if ticket["claimed_by"]:
                raise TicketError(f"Already claimed by {mention(ticket['claimed_by'])}.")
            if ticket["kind"] != "support" and ticket["stage"] != "submitted":
                raise TicketError("The customer hasn't finished submitting this order yet.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        await ack(interaction)
        for role_id in (g["staff_role"], g["chef_role"]):
            role = channel.guild.get_role(role_id) if role_id else None
            if role:
                await channel.set_permissions(role, overwrite=staff_overwrite(False), reason=f"Claimed by {member}")
        if member.id != ticket["owner_id"]:
            await channel.set_permissions(member, overwrite=member_overwrite(), reason=f"Claimed by {member}")

        ticket.update(claimed_by=member.id, claimed_at=int(time.time()))
        await update_summary(channel, ticket, ClaimView(claimed=True))

        embed = discord.Embed(
            title="🙋 Order Claimed",
            description=(f"{member.mention} has claimed this order and is working on it now! 🧑‍🍳\n\n"
                         f"🔐 Only {mention(ticket['owner_id'])}, {member.mention} and **administrators** can type here."),
            color=COLOR_BLUE,
        )
        embed.add_field(name="👤 Customer", value=mention(ticket["owner_id"]), inline=True)
        embed.add_field(name="🧑‍🍳 Chef", value=member.mention, inline=True)
        if ticket.get("due"):
            embed.add_field(name="💵 Amount Due", value=money(Decimal(ticket["due"])), inline=True)
            embed.add_field(name="💳 Payment", value=payment_text(ticket), inline=True)
        embed.add_field(name="🕒 Claimed", value=ts(ticket["claimed_at"]), inline=True)
        embed.add_field(name="🛠️ Chef Controls", value=(
            "**💰 Payment Received** — confirm the customer paid\n"
            "**🛒 Order Placed** — you placed the order with the restaurant\n"
            "**🚗 On The Way** — the food is out for delivery\n"
            "**↩️ Unclaim** — give the order back\n"
            "**✅ Mark Complete** — finish the order (or `/complete`)"), inline=False)
        embed.add_field(name="📣 Customer updates",
                        value="Every button pings the customer with a live update and fills in the order timeline.",
                        inline=False)
        msg = await channel.send(content=mention(ticket["owner_id"]), embed=stamp(embed, f"Order #{ticket['number']:04d}"),
                                 view=ClaimedView(ticket),
                                 allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
        ticket["claim_msg_id"] = msg.id
        store.set_ticket(channel.id, ticket)
        await finish(interaction, "✅ You claimed this order.")


async def do_unclaim(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    await ack(interaction)
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            g = store.guild(channel.guild.id)
            if not ticket["claimed_by"]:
                raise TicketError("This order isn't claimed.")
            if ticket["completed"]:
                raise TicketError("This order is already completed.")
            if member.id != ticket["claimed_by"] and not is_owner(member):
                raise TicketError(f"Only {mention(ticket['claimed_by'])} or the owner can unclaim this.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        await ack(interaction)
        previous = ticket["claimed_by"]
        for role_id in (g["staff_role"], g["chef_role"]):
            role = channel.guild.get_role(role_id) if role_id else None
            if role:
                await channel.set_permissions(role, overwrite=staff_overwrite(True), reason=f"Unclaimed by {member}")
        if previous != ticket["owner_id"]:
            try:  # raw call works even if the member isn't cached
                await interaction.client.http.delete_channel_permissions(channel.id, previous,
                                                                         reason=f"Unclaimed by {member}")
            except discord.HTTPException:
                pass

        ticket.update(claimed_by=None, claimed_at=None, placed_at=None, onway_at=None)
        await disable_claim_message(channel, ticket)
        await update_summary(channel, ticket, ClaimView())
        store.set_ticket(channel.id, ticket)

        ping_role = g["chef_role"] or g["staff_role"]
        embed = discord.Embed(
            title="↩️ Order Unclaimed",
            description=(f"{member.mention} unclaimed this order (was {mention(previous)}).\n\n"
                         "🔓 Staff can type here again — the order is **back up for grabs**. "
                         "Press **Claim Order** on the order above."),
            color=COLOR_ORANGE,
        )
        await channel.send(content=role_mention(ping_role) if ping_role else None,
                           embed=stamp(embed, f"Order #{ticket['number']:04d}"),
                           allowed_mentions=discord.AllowedMentions(roles=True, users=False, everyone=False))
        await finish(interaction, "✅ Order unclaimed.")


async def do_complete(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    await ack(interaction)
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            if ticket["completed"]:
                raise TicketError("This order is already marked complete.")
            if not ticket["claimed_by"]:
                raise TicketError("Claim the order first (press **Claim Order** or use `/claim`).")
            if member.id != ticket["claimed_by"] and not is_owner(member):
                raise TicketError(f"Only {mention(ticket['claimed_by'])} or the owner can complete this.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        await ack(interaction)
        guild = channel.guild
        g = store.guild(guild.id)
        chef = ticket["claimed_by"]
        ticket.update(completed=True, stage="completed", completed_at=int(time.time()))
        await disable_claim_message(channel, ticket)
        await update_summary(channel, ticket, ClaimView(done=True))
        store.set_ticket(channel.id, ticket)

        s = store.stats(guild.id, chef)
        s["orders"] += 1
        if ticket.get("due"):
            s["revenue"] = str(Decimal(s["revenue"]) + Decimal(ticket["due"]))
        took = int(time.time()) - (ticket.get("claimed_at") or int(time.time()))
        g["orders_completed"] += 1
        g["completion_seconds"] += took
        c = store.customer(guild.id, ticket["owner_id"])
        c["orders"] += 1
        if ticket.get("due"):
            c["spent"] = str(Decimal(c["spent"]) + Decimal(ticket["due"]))
        store.save()
        embed = discord.Embed(
            title="✅ Order Complete",
            description=(f"This order from {mention(ticket['owner_id'])} has been done by {mention(chef)}. 🎉\n\n"
                         f"Thanks for ordering with **{BRAND}**! Press **Close Ticket** when you're finished."),
            color=COLOR_GREEN,
        )
        embed.add_field(name="👤 Customer", value=mention(ticket["owner_id"]), inline=True)
        embed.add_field(name="🧑‍🍳 Done by", value=mention(chef), inline=True)
        embed.add_field(name="🆔 Order", value=f"#{ticket['number']:04d}", inline=True)
        if ticket.get("total"):
            embed.add_field(name="🧾 Order Total", value=money(Decimal(ticket["total"])), inline=True)
            embed.add_field(name="💵 Paid", value=money(Decimal(ticket["due"])), inline=True)
            embed.add_field(name="💳 Payment", value=payment_text(ticket), inline=True)
        embed.add_field(name="⏱️ Time to complete", value=duration(took), inline=True)
        embed.add_field(name="🏆 Chef's orders", value=str(s["orders"]), inline=True)
        embed.add_field(name="👥 Your orders with us", value=str(c["orders"]), inline=True)
        embed.add_field(name="🧭 Timeline", value=timeline_text(ticket), inline=False)
        stamp(embed, f"Order #{ticket['number']:04d}")
        await channel.send(content=mention(ticket["owner_id"]), embed=embed, view=TicketControlView(),
                           allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
        rate = discord.Embed(
            title="⭐ How was your order?",
            description=(f"{mention(ticket['owner_id'])}, rate your experience with {mention(chef)} "
                         "by pressing **1–5** below. It helps us keep the food (and service) great! 🍔"),
            color=COLOR_GOLD,
        )
        await channel.send(embed=stamp(rate, f"Order #{ticket['number']:04d}"), view=RateView())

        # receipt DM to the customer (ignored if their DMs are closed)
        try:
            customer = guild.get_member(ticket["owner_id"]) or await interaction.client.fetch_user(ticket["owner_id"])
            receipt = embed.copy()
            receipt.title = f"🧾 Your {BRAND} receipt"
            receipt.description = f"Your order in **{guild.name}** has been done by {mention(chef)}. Enjoy! 🍽️"
            await customer.send(embed=receipt)
        except (discord.HTTPException, AttributeError):
            pass

        logch = get_log_channel(guild)
        if logch:
            log_embed = embed.copy()
            log_embed.title = "📦 Order Completed"
            log_embed.description = (f"This order from {mention(ticket['owner_id'])} has been done by {mention(chef)}.\n"
                                     f"Channel: {channel.mention}")
            try:
                await logch.send(embed=log_embed, allowed_mentions=discord.AllowedMentions.none())
            except discord.HTTPException:
                pass
        await refresh_panels(guild)
        await finish(interaction, "✅ Order marked complete.")


PROGRESS_STEPS = {
    "paid":   ("paid_at",   "💰 Payment Received", COLOR_GREEN),
    "placed": ("placed_at", "🛒 Order Placed",     COLOR_BLURPLE),
    "onway":  ("onway_at",  "🚗 Out for Delivery", COLOR_GOLD),
}


async def do_progress(interaction: discord.Interaction, step: str) -> None:
    channel, member = interaction.channel, interaction.user
    key, title, color = PROGRESS_STEPS[step]
    await ack(interaction)
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            if ticket["kind"] == "support":
                raise TicketError("Progress buttons are for orders only.")
            if ticket["completed"]:
                raise TicketError("This order is already completed.")
            if not ticket["claimed_by"]:
                raise TicketError("Claim the order first.")
            if member.id != ticket["claimed_by"] and not is_owner(member):
                raise TicketError(f"Only {mention(ticket['claimed_by'])} or the owner can update this order.")
            if ticket.get(key):
                raise TicketError(f"**{title}** was already marked {ts(ticket[key])}.")
            if step == "onway" and not ticket.get("placed_at"):
                raise TicketError("Mark **🛒 Order Placed** before **🚗 On The Way**.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        ticket[key] = int(time.time())
        store.set_ticket(channel.id, ticket)
        if ticket.get("claim_msg_id"):
            try:
                await channel.get_partial_message(ticket["claim_msg_id"]).edit(view=ClaimedView(ticket))
            except discord.HTTPException:
                pass

        chef, customer = mention(ticket["claimed_by"]), mention(ticket["owner_id"])
        where = ticket.get("restaurant") or "the restaurant"
        if step == "paid":
            due = money(Decimal(ticket["due"])) if ticket.get("due") else "your payment"
            text = (f"{chef} confirmed your payment of **{due}** via **{payment_text(ticket)}**. ✅\n"
                    "Your order is being placed next!")
        elif step == "placed":
            text = (f"{chef} placed your order at **{where}**. 🧾\n"
                    "Keep your phone nearby in case the restaurant or driver contacts you.")
        else:
            text = (f"Your food is on the way! 🚗💨\n📍 Delivering to: **{ticket.get('address') or 'your address'}**\n"
                    "Watch the door — it'll be there soon.")
        embed = discord.Embed(title=title, description=text, color=color)
        embed.add_field(name="🧭 Progress", value=timeline_text(ticket), inline=False)
        await channel.send(content=customer, embed=stamp(embed, f"Order #{ticket['number']:04d}"),
                           allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
        await update_summary(channel, ticket, ClaimView(claimed=True))
        await finish(interaction, f"✅ {title} sent to the customer.")


async def do_rate(interaction: discord.Interaction, score: int) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = store.ticket(channel.id) if channel else None
        if ticket is None:
            return await send_error(interaction, "This ticket no longer exists.")
        if interaction.user.id != ticket["owner_id"]:
            return await send_error(interaction, "Only the customer can rate this order.")
        if not ticket.get("completed"):
            return await send_error(interaction, "You can rate once the order is complete.")
        if ticket.get("rating"):
            return await send_error(interaction, f"You already rated this order {stars(ticket['rating'])}.")

        ticket["rating"] = score
        store.set_ticket(channel.id, ticket)
        s = store.stats(channel.guild.id, ticket["claimed_by"])
        s["rating_sum"] += score
        s["rating_count"] += 1
        store.save()

        embed = discord.Embed(
            title="⭐ Thanks for your rating!",
            description=(f"You rated {mention(ticket['claimed_by'])} **{stars(score)}** ({score}/5).\n"
                         f"We appreciate you ordering with **{BRAND}**! 💛"),
            color=COLOR_GOLD,
        )
        embed.add_field(name="🧑‍🍳 Chef's rating", value=rating_text(s["rating_sum"], s["rating_count"]), inline=True)
        await interaction.message.edit(embed=stamp(embed, f"Order #{ticket['number']:04d}"),
                                       view=RateView(chosen=score))
        logch = get_log_channel(channel.guild)
        if logch:
            le = discord.Embed(title="⭐ New Rating", color=COLOR_GOLD,
                               description=(f"{mention(ticket['owner_id'])} rated {mention(ticket['claimed_by'])} "
                                            f"**{stars(score)}** for order #{ticket['number']:04d}."))
            try:
                await logch.send(embed=stamp(le), allowed_mentions=discord.AllowedMentions.none())
            except discord.HTTPException:
                pass


def check_can_close(member: discord.Member, ticket: dict) -> None:
    g = store.guild(ticket["guild_id"])
    if member.id != ticket["owner_id"] and not is_staff(member, g):
        raise TicketError("Only the customer, chefs or the owner can close this ticket.")


TICKET_NAME_RE = re.compile(r"^(order|vip|support)-\d{4}-")


def check_close_allowed(channel, member: discord.Member) -> Optional[dict]:
    """Return the ticket (or None for a ticket channel the bot lost track of). Raises if not allowed."""
    ticket = store.ticket(channel.id) if channel else None
    if ticket is not None:
        check_can_close(member, ticket)
        return ticket
    if isinstance(channel, discord.TextChannel) and TICKET_NAME_RE.match(channel.name):
        g = store.guild(channel.guild.id)
        if not is_staff(member, g):
            raise TicketError("Only chefs or the owner can close this ticket.")
        return None
    raise TicketError("This only works inside a ticket channel.")


def get_log_channel(guild: discord.Guild) -> Optional[discord.TextChannel]:
    g = store.guild(guild.id)
    ch = guild.get_channel(g["log_channel"]) if g["log_channel"] else None
    return ch if isinstance(ch, discord.TextChannel) else None


async def build_transcript(channel: discord.TextChannel) -> discord.File:
    lines = [f"{BRAND} transcript - #{channel.name} ({channel.id})", "=" * 60]
    async for m in channel.history(limit=5000, oldest_first=True):
        parts = [m.content] if m.content else []
        for e in m.embeds:
            parts.append(f"[embed: {e.title or ''} | {(e.description or '').strip()}]")
            parts.extend(f"  {f.name}: {f.value}" for f in e.fields)
        parts.extend(f"[attachment: {a.filename} {a.url}]" for a in m.attachments)
        lines.append(f"[{m.created_at:%Y-%m-%d %H:%M:%S} UTC] {m.author} ({m.author.id}): " + "\n".join(parts))
    return discord.File(io.BytesIO("\n".join(lines).encode("utf-8")), filename=f"transcript-{channel.name}.txt")


async def close_ticket(channel: discord.TextChannel, closer: discord.Member, reason: str) -> None:
    ticket = check_close_allowed(channel, closer)
    if ticket is None:   # untracked ticket channel (e.g. from an older version): just delete it
        await channel.send(embed=stamp(discord.Embed(
            title="🔒 Ticket Closing",
            description=f"Closed by {closer.mention}. Deleting in **{CLOSE_DELAY_SECONDS} seconds**.",
            color=COLOR_RED)))
        await asyncio.sleep(CLOSE_DELAY_SECONDS)
        try:
            await channel.delete(reason=f"Ticket closed by {closer}: {reason}")
        except discord.HTTPException as exc:
            log.warning("Could not delete %s: %s", channel.id, exc)
        return
    if ticket.get("closing"):
        raise TicketError("This ticket is already closing.")
    ticket["closing"] = True
    store.set_ticket(channel.id, ticket)

    embed = discord.Embed(title="🔒 Ticket Closing",
                          description=f"Closed by {closer.mention}. This channel will be deleted in **{CLOSE_DELAY_SECONDS} seconds**.",
                          color=COLOR_RED)
    embed.add_field(name="📝 Reason", value=reason[:1024], inline=False)
    await channel.send(embed=stamp(embed))

    logch = get_log_channel(channel.guild)
    if logch:
        le = discord.Embed(title="🔒 Ticket Closed", color=COLOR_RED)
        le.add_field(name="🎫 Ticket", value=f"#{ticket['number']:04d} • `{channel.name}`", inline=True)
        le.add_field(name="📂 Type", value=ticket["kind"].upper(), inline=True)
        le.add_field(name="👤 Opened by", value=mention(ticket["owner_id"]), inline=True)
        le.add_field(name="🔒 Closed by", value=closer.mention, inline=True)
        le.add_field(name="🧑‍🍳 Claimed by", value=mention(ticket["claimed_by"]), inline=True)
        le.add_field(name="✅ Completed", value="Yes" if ticket["completed"] else "No", inline=True)
        le.add_field(name="🕒 Opened", value=ts(ticket["opened_at"], "f"), inline=True)
        le.add_field(name="📝 Reason", value=reason[:1024], inline=False)
        try:
            await logch.send(embed=stamp(le), file=await build_transcript(channel),
                             allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException as exc:
            log.warning("Transcript/log failed: %s", exc)

    await asyncio.sleep(CLOSE_DELAY_SECONDS)
    store.delete_ticket(channel.id)
    channel_locks.pop(channel.id, None)
    try:
        await channel.delete(reason=f"Ticket closed by {closer}: {reason}")
    except discord.NotFound:
        pass
    except discord.HTTPException as exc:
        log.warning("Could not delete %s: %s", channel.id, exc)


# ==========================================================================
# Command tree: only owners/admins and chefs may use slash commands
# ==========================================================================
class GatedTree(app_commands.CommandTree):
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.type == discord.InteractionType.autocomplete:
            return (interaction.guild is not None and isinstance(interaction.user, discord.Member)
                    and can_use_commands(interaction.user, store.guild(interaction.guild.id)))
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await send_error(interaction, "Commands only work inside a server.")
            return False
        g = store.guild(interaction.guild.id)
        if can_use_commands(interaction.user, g):
            return True
        await send_error(interaction, f"🔒 Commands are only for the **server owner** and "
                                      f"{role_mention(g['chef_role'])}.")
        return False

    async def on_error(self, interaction: discord.Interaction, error: app_commands.AppCommandError):
        if isinstance(error, app_commands.MissingPermissions):
            msg = "Only the **server owner / administrators** can use this command."
        elif isinstance(error, app_commands.CommandInvokeError) and isinstance(error.original, discord.Forbidden):
            msg = "I'm missing permissions for that. Give my role **Administrator**."
        else:
            msg = f"Something went wrong: `{error}`"
            log.error("Command error", exc_info=error)
        await send_error(interaction, msg)


def owner_only():
    async def predicate(interaction: discord.Interaction) -> bool:
        if not is_owner(interaction.user):
            raise app_commands.MissingPermissions(["administrator"])
        return True
    return app_commands.check(predicate)


# ---- Setup (owner only) --------------------------------------------------
@app_commands.command(name="ticket", description="Set up the Food and b4u ticket system and post the Order Desk panel")
@app_commands.describe(
    staff_role="Role that gets added to every ticket",
    category="Category the tickets will be created in",
    chef_role="Role that gets pinged for new orders and can use commands",
    log_channel="Channel for transcripts & completed orders (optional)",
    vip_role="Only this role can open VIP tickets (optional)",
    panel_channel="Where to post the panel (defaults to this channel)",
)
@app_commands.guild_only()
@owner_only()
async def ticket_cmd(interaction: discord.Interaction, staff_role: discord.Role, category: discord.CategoryChannel,
                     chef_role: Optional[discord.Role] = None, log_channel: Optional[discord.TextChannel] = None,
                     vip_role: Optional[discord.Role] = None, panel_channel: Optional[discord.TextChannel] = None):
    target = panel_channel or interaction.channel
    if not isinstance(target, discord.TextChannel):
        return await send_error(interaction, "Run this in a normal text channel or pick `panel_channel`.")
    g = store.guild(interaction.guild.id)
    g["staff_role"], g["category"] = staff_role.id, category.id
    if chef_role:
        g["chef_role"] = chef_role.id
    if log_channel:
        g["log_channel"] = log_channel.id
    if vip_role:
        g["vip_role"] = vip_role.id
    store.save()
    try:
        panel = await target.send(embed=panel_embed(interaction.guild, g), view=PanelView())
    except discord.HTTPException as exc:
        return await send_error(interaction, f"I couldn't post the panel in {target.mention}: {exc}")
    g["panels"].append([target.id, panel.id])
    store.save()

    embed = discord.Embed(title="✅ Ticket System Ready", description=f"Panel posted in {target.mention}.", color=COLOR_GREEN)
    embed.add_field(name="👮 Staff Role", value=staff_role.mention, inline=True)
    embed.add_field(name="🧑‍🍳 Chef Role", value=role_mention(g["chef_role"]), inline=True)
    embed.add_field(name="⭐ VIP Role", value=role_mention(g["vip_role"]) if g["vip_role"] else "*anyone*", inline=True)
    embed.add_field(name="📂 Category", value=category.mention, inline=True)
    embed.add_field(name="📜 Logs", value=f"<#{g['log_channel']}>" if g["log_channel"] else "*not set*", inline=True)
    embed.add_field(name="✍️ Typed answers", value="On" if TYPED_INPUT else "Off (forms only)", inline=True)
    if not g["chef_role"]:
        embed.add_field(name="💡 Tip", value="Use `/setchef` so chefs get pinged and can use commands.", inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="setchef", description="Set the chef role (pinged for orders, can use commands)")
@app_commands.describe(role="The chef role")
@app_commands.guild_only()
@owner_only()
async def setchef_cmd(interaction: discord.Interaction, role: discord.Role):
    g = store.guild(interaction.guild.id)
    g["chef_role"] = role.id
    store.save()
    embed = discord.Embed(
        title="🧑‍🍳 Chef Role Set",
        description=(f"{role.mention} will be pinged for every new order and can use the bot's commands "
                     "(**claim**, **unclaim**, **complete**, **close**, **clockin** …).\n\n"
                     "⚠️ If the role isn't mentionable, give my role **Mention @everyone, @here and All Roles**."),
        color=COLOR_GREEN,
    )
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="setlogs", description="Set the channel for transcripts and completed orders")
@app_commands.guild_only()
@owner_only()
async def setlogs_cmd(interaction: discord.Interaction, channel: discord.TextChannel):
    g = store.guild(interaction.guild.id)
    g["log_channel"] = channel.id
    store.save()
    await interaction.response.send_message(
        embed=stamp(discord.Embed(title="📜 Log Channel Set", description=channel.mention, color=COLOR_GREEN)),
        ephemeral=True)


@app_commands.command(name="panel", description="Re-post the Order Desk panel in this channel")
@app_commands.guild_only()
@owner_only()
async def panel_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    if not g["category"]:
        return await send_error(interaction, "Run `/ticket` first.")
    if not isinstance(interaction.channel, discord.TextChannel):
        return await send_error(interaction, "Run this in a normal text channel.")
    msg = await interaction.channel.send(embed=panel_embed(interaction.guild, g), view=PanelView())
    g["panels"].append([interaction.channel.id, msg.id])
    store.save()
    await interaction.response.send_message("✅ Panel posted.", ephemeral=True)


# ---- Clock in / out --------------------------------------------------------
@app_commands.command(name="clockin", description="Clock in — you'll show under Staff Online")
@app_commands.guild_only()
async def clockin_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    uid = str(interaction.user.id)
    if uid in g["clocked_in"]:
        return await send_error(interaction, f"You're already clocked in (since {ts(g['clocked_in'][uid])}). "
                                             "Use `/clockout` when you're done.")
    g["clocked_in"][uid] = int(time.time())
    store.save()
    await interaction.response.defer(ephemeral=True, thinking=True)
    await refresh_panels(interaction.guild)
    embed = discord.Embed(title="🟢 Clocked In",
                          description=f"{interaction.user.mention} you're now listed under **Staff Online**. Let's cook! 🍳",
                          color=COLOR_GREEN)
    embed.add_field(name="🕒 Started", value=ts(g["clocked_in"][uid], "t"), inline=True)
    embed.add_field(name="👥 Staff Online", value=str(len(g["clocked_in"])), inline=True)
    await interaction.followup.send(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="clockout", description="Clock out — you'll be removed from Staff Online")
@app_commands.guild_only()
async def clockout_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    uid = str(interaction.user.id)
    if uid not in g["clocked_in"]:
        return await send_error(interaction, "You aren't clocked in.")
    worked = int(time.time()) - g["clocked_in"].pop(uid)
    s = store.stats(interaction.guild.id, interaction.user.id)
    s["seconds"] += worked
    store.save()
    await interaction.response.defer(ephemeral=True, thinking=True)
    await refresh_panels(interaction.guild)
    embed = discord.Embed(title="🔴 Clocked Out",
                          description=f"{interaction.user.mention} you've been removed from **Staff Online**. Good work! 👋",
                          color=COLOR_RED)
    embed.add_field(name="⏱️ This shift", value=duration(worked), inline=True)
    embed.add_field(name="📊 All-time", value=duration(s["seconds"]), inline=True)
    await interaction.followup.send(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="staffonline", description="See who is clocked in")
@app_commands.guild_only()
async def staffonline_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    online = g["clocked_in"]
    embed = discord.Embed(
        title=f"🟢 Staff Online ({len(online)})",
        description="\n".join(f"{mention(u)} — since {ts(t)}" for u, t in online.items()) or "*No staff clocked in*",
        color=COLOR_GREEN)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="stats", description="Show a chef's stats")
@app_commands.guild_only()
async def stats_cmd(interaction: discord.Interaction, member: Optional[discord.Member] = None):
    member = member or interaction.user
    g = store.guild(interaction.guild.id)
    s = store.stats(interaction.guild.id, member.id)
    since = g["clocked_in"].get(str(member.id))
    embed = discord.Embed(title=f"📊 Stats — {member.display_name}", color=COLOR_BLURPLE)
    embed.set_thumbnail(url=member.display_avatar.url)
    embed.add_field(name="📦 Orders completed", value=str(s["orders"]), inline=True)
    embed.add_field(name="💵 Payments handled", value=money(Decimal(s["revenue"])), inline=True)
    embed.add_field(name="⏱️ Time clocked", value=duration(s["seconds"] + (time.time() - since if since else 0)), inline=True)
    embed.add_field(name="⭐ Rating", value=rating_text(s["rating_sum"], s["rating_count"]), inline=True)
    c = g["customers"].get(str(member.id))
    if c and c.get("orders"):
        embed.add_field(name="🛍️ As a customer", value=f"{c['orders']} order(s) • {money(Decimal(c['spent']))} paid",
                        inline=True)
    embed.add_field(name="🟢 Status", value=f"Clocked in {ts(since)}" if since else "🔴 Clocked out", inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="leaderboard", description="Top chefs by completed orders")
@app_commands.guild_only()
async def leaderboard_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    top = sorted(g["stats"].items(), key=lambda kv: kv[1].get("orders", 0), reverse=True)[:10]
    medals = ["🥇", "🥈", "🥉"] + ["🏅"] * 7
    lines = [f"{medals[i]} {mention(uid)} — **{s.get('orders', 0)}** orders • "
             f"{money(Decimal(s.get('revenue', '0')))} • {rating_text(s.get('rating_sum', 0), s.get('rating_count', 0))}"
             for i, (uid, s) in enumerate(top) if s.get("orders", 0)]
    embed = discord.Embed(title="🏆 Chef Leaderboard", description="\n".join(lines) or "*No completed orders yet*",
                          color=COLOR_GOLD)
    embed.add_field(name="📦 Total orders", value=str(g["orders_completed"]), inline=True)
    embed.add_field(name="⚡ Avg. completion",
                    value=duration(g["completion_seconds"] / g["orders_completed"]) if g["orders_completed"] else "—",
                    inline=True)
    await interaction.response.send_message(embed=stamp(embed))


# ---- Ticket commands -------------------------------------------------------
@app_commands.command(name="claim", description="Claim the order in this ticket")
@app_commands.guild_only()
async def claim_cmd(interaction: discord.Interaction):
    await do_claim(interaction)


@app_commands.command(name="unclaim", description="Unclaim the order in this ticket")
@app_commands.guild_only()
async def unclaim_cmd(interaction: discord.Interaction):
    await do_unclaim(interaction)


@app_commands.command(name="complete", description="Mark the order in this ticket as done")
@app_commands.guild_only()
async def complete_cmd(interaction: discord.Interaction):
    await do_complete(interaction)


@app_commands.command(name="close", description="Close and delete this ticket (saves a transcript)")
@app_commands.describe(reason="Why the ticket is being closed")
@app_commands.guild_only()
async def close_cmd(interaction: discord.Interaction, reason: Optional[str] = None):
    try:
        check_close_allowed(interaction.channel, interaction.user)
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.response.send_message("🔒 Closing ticket…", ephemeral=True)
    try:
        await close_ticket(interaction.channel, interaction.user, reason or "No reason given")
    except TicketError as exc:
        await send_error(interaction, str(exc))


@app_commands.command(name="add", description="Add a member to this ticket")
@app_commands.guild_only()
async def add_cmd(interaction: discord.Interaction, member: discord.Member):
    try:
        get_ticket_or_fail(interaction.channel)
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.channel.set_permissions(member, overwrite=member_overwrite(), reason=f"Added by {interaction.user}")
    await interaction.response.send_message(embed=note(
        f"➕ {member.mention} was added to the ticket by {interaction.user.mention}.", COLOR_GREEN))


@app_commands.command(name="remove", description="Remove a member from this ticket")
@app_commands.guild_only()
async def remove_cmd(interaction: discord.Interaction, member: discord.Member):
    try:
        ticket = get_ticket_or_fail(interaction.channel)
        if member.id == ticket["owner_id"]:
            raise TicketError("You can't remove the customer — close the ticket instead.")
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.channel.set_permissions(member, overwrite=None, reason=f"Removed by {interaction.user}")
    await interaction.response.send_message(embed=note(
        f"➖ {member.mention} was removed from the ticket by {interaction.user.mention}.", COLOR_RED))


@app_commands.command(name="rename", description="Rename this ticket channel")
@app_commands.guild_only()
async def rename_cmd(interaction: discord.Interaction, name: str):
    try:
        get_ticket_or_fail(interaction.channel)
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    new = slugify(name)
    await interaction.response.defer(ephemeral=True, thinking=True)
    await interaction.channel.edit(name=new[:90], reason=f"Renamed by {interaction.user}")
    await interaction.followup.send(f"✏️ Renamed to `{new}`.", ephemeral=True)


@app_commands.command(name="orderinfo", description="Show every detail of the order in this ticket")
@app_commands.guild_only()
async def orderinfo_cmd(interaction: discord.Interaction):
    try:
        t = get_ticket_or_fail(interaction.channel)
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    info = KIND_INFO[t["kind"]]
    embed = discord.Embed(title=f"🔎 {info['title']} #{t['number']:04d}", color=info["color"])
    embed.add_field(name="👤 Customer", value=mention(t["owner_id"]), inline=True)
    embed.add_field(name="🧑‍🍳 Chef", value=mention(t.get("claimed_by")), inline=True)
    embed.add_field(name="📂 Step", value=f"`{t['stage']}`", inline=True)
    if t.get("address"):
        embed.add_field(name="🏠 Delivery Details", value=location_lines(t), inline=False)
    if t.get("total"):
        embed.add_field(name="🧾 Order Total", value=money(Decimal(t["total"])), inline=True)
    if t.get("due"):
        embed.add_field(name="💵 Customer Pays", value=money(Decimal(t["due"])), inline=True)
    if t.get("payment"):
        embed.add_field(name="💳 Payment", value=payment_text(t), inline=True)
    embed.add_field(name="💰 Payment Status", value=paid_text(t), inline=True)
    embed.add_field(name="⭐ Rating", value=stars(t["rating"]) if t.get("rating") else "—", inline=True)
    embed.add_field(name="👥 Customer History", value=customer_history(store.guild(t["guild_id"]), t["owner_id"]),
                    inline=True)
    embed.add_field(name="📌 Status", value=order_status(t) if t["kind"] != "support" else "💬 Support ticket",
                    inline=False)
    embed.add_field(name="🧭 Timeline", value=f"🟢 🎫 Opened — {ts(t['opened_at'])}\n" + timeline_text(t), inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="blacklist", description="Block a member from opening tickets")
@app_commands.describe(member="Who to block", reason="Why (shown to them)")
@app_commands.guild_only()
@owner_only()
async def blacklist_cmd(interaction: discord.Interaction, member: discord.Member, reason: Optional[str] = None):
    g = store.guild(interaction.guild.id)
    g["blacklist"][str(member.id)] = (reason or "No reason given")[:200]
    store.save()
    embed = discord.Embed(title="🚫 Member Blacklisted",
                          description=f"{member.mention} can no longer open tickets.", color=COLOR_RED)
    embed.add_field(name="📝 Reason", value=g["blacklist"][str(member.id)], inline=False)
    embed.add_field(name="📋 Total blacklisted", value=str(len(g["blacklist"])), inline=True)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="unblacklist", description="Allow a blocked member to open tickets again")
@app_commands.guild_only()
@owner_only()
async def unblacklist_cmd(interaction: discord.Interaction, member: discord.Member):
    g = store.guild(interaction.guild.id)
    if g["blacklist"].pop(str(member.id), None) is None:
        return await send_error(interaction, f"{member.mention} isn't blacklisted.")
    store.save()
    await interaction.response.send_message(embed=note(f"✅ {member.mention} can open tickets again.", COLOR_GREEN),
                                            ephemeral=True)


@app_commands.command(name="list", description="Post the restaurant list in this channel")
@app_commands.guild_only()
async def list_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    await interaction.response.send_message(embed=list_embed(interaction.guild, g), view=ListView())


@app_commands.command(name="listadd", description="Add a restaurant to /list")
@app_commands.describe(name="Restaurant name (you can add notes like [Half Off] or (pickup))",
                       column="Which column of the list (1-3)")
@app_commands.guild_only()
@owner_only()
async def listadd_cmd(interaction: discord.Interaction, name: app_commands.Range[str, 2, 60],
                      column: app_commands.Range[int, 1, 3] = 3):
    g = store.guild(interaction.guild.id)
    name = name.strip()
    for col in g["restaurants"]:
        for item in col:
            if _norm(item) == _norm(name):
                return await send_error(interaction, f"**{item}** is already on the list.")
    while len(g["restaurants"]) < column:
        g["restaurants"].append([])
    g["restaurants"][column - 1].append(name)
    store.save()
    count = sum(len(c) for c in g["restaurants"])
    await interaction.response.send_message(embed=note(
        f"✅ Added **{name}** to list {column}. The list now has **{count}** restaurants.\n"
        "Run `/list` again to post the updated list.", COLOR_GREEN), ephemeral=True)


@app_commands.command(name="listremove", description="Remove a restaurant from /list")
@app_commands.describe(name="Restaurant to remove")
@app_commands.guild_only()
@owner_only()
async def listremove_cmd(interaction: discord.Interaction, name: str):
    g = store.guild(interaction.guild.id)
    for col in g["restaurants"]:
        for item in col:
            if _norm(item) == _norm(name) or item == name:
                col.remove(item)
                store.save()
                return await interaction.response.send_message(embed=note(
                    f"🗑️ Removed **{item}** from the list. Run `/list` again to post the updated list.",
                    COLOR_GREEN), ephemeral=True)
    await send_error(interaction, f"**{name}** isn't on the list.")


@listremove_cmd.autocomplete("name")
async def listremove_autocomplete(interaction: discord.Interaction, current: str):
    g = store.guild(interaction.guild.id) if interaction.guild else {"restaurants": []}
    items = [i for col in g["restaurants"] for i in col if _norm(current) in _norm(i)]
    return [app_commands.Choice(name=i[:100], value=i[:100]) for i in items[:25]]


@app_commands.command(name="queue", description="See every order waiting for a chef and in progress")
@app_commands.guild_only()
async def queue_cmd(interaction: discord.Interaction):
    gid = interaction.guild.id
    waiting = waiting_orders(gid)
    active = [(int(cid), t) for cid, t in store.tickets().items()
              if t["guild_id"] == gid and t.get("claimed_by") and not t.get("completed") and t["kind"] != "support"]

    def lines(rows, fmt):
        out, size = [], 0
        for i, (cid, t) in enumerate(rows, 1):
            line = fmt(i, cid, t)
            if size + len(line) > 1000:
                out.append(f"*…and {len(rows) - i + 1} more*")
                break
            out.append(line)
            size += len(line) + 1
        return "\n".join(out)

    embed = discord.Embed(title="📋 Order Queue", color=COLOR_ORANGE if waiting else COLOR_GREEN,
                          description="⭐ VIP orders are listed first. Press **Claim Order** inside a ticket to take it.")
    embed.add_field(name=f"🟠 Waiting for a chef ({len(waiting)})", value=lines(waiting, lambda i, cid, t: (
        f"**{i}.** {'⭐ ' if t['kind'] == 'vip' else ''}<#{cid}> — {mention(t['owner_id'])} — "
        f"{money(Decimal(t['due'])) if t.get('due') else '—'} — waiting since {ts(t.get('submitted_at') or t['opened_at'])}"
    )) or "*Nothing waiting* 🎉", inline=False)
    embed.add_field(name=f"🔵 In progress ({len(active)})", value=lines(active, lambda i, cid, t: (
        f"<#{cid}> — {mention(t['claimed_by'])} — {order_status(t).split(' — ')[0].split(' by ')[0]}"
    )) or "*No active orders*", inline=False)
    embed.add_field(name="🟢 Staff Online", value=str(len(store.guild(gid)["clocked_in"])), inline=True)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="help", description="Show all Food and b4u bot commands")
@app_commands.guild_only()
async def help_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    embed = discord.Embed(title=f"🍽️ {BRAND} Bot — Commands",
                          description=f"🔒 Commands work for the **server owner** and {role_mention(g['chef_role'])} only.",
                          color=COLOR_BLURPLE)
    embed.add_field(name="⚙️ Setup (owner only)", value=(
        "`/ticket` — set staff role, category, chef role and post the panel\n"
        "`/setchef` — set the chef role\n"
        "`/setlogs` — set the transcript / log channel\n"
        "`/panel` — re-post the panel here\n"
        "`/blacklist` · `/unblacklist` — block / unblock a member from tickets\n"
        "`/listadd` · `/listremove` — edit the restaurant list"), inline=False)
    embed.add_field(name="🍽️ Menu", value=(
        "`/list` — post the restaurant list with **Create Order** + **Price Calculator** buttons\n"
        f"The panel also has **📋 Restaurants** and **🧮 Price Calculator** buttons (you pay {PRICE_RULE})."),
        inline=False)
    embed.add_field(name="🕒 Shifts", value=(
        "`/clockin` — show under Staff Online\n"
        "`/clockout` — leave Staff Online (shows shift time)\n"
        "`/staffonline` — who's working\n"
        "`/stats` · `/leaderboard` — chef stats"), inline=False)
    embed.add_field(name="🎫 Tickets", value=(
        "`/claim` — claim the order (locks chat to customer + you + admins)\n"
        "`/unclaim` — give the order back\n"
        "`/complete` — mark the order done\n"
        "`/close` — close & delete the ticket (transcript saved)\n"
        "`/orderinfo` — every detail of this order\n"
        "`/queue` — every order waiting / in progress\n"
        "`/add` · `/remove` · `/rename` — manage the ticket"), inline=False)
    embed.add_field(name="🔘 Chef buttons (after claiming)", value=(
        "💰 **Payment Received** → 🛒 **Order Placed** → 🚗 **On The Way** → ✅ **Mark Complete**\n"
        "Each one pings the customer and updates the order timeline. ↩️ **Unclaim** gives it back."), inline=False)
    embed.add_field(name="⭐ After completion", value="The customer rates the chef 1–5 stars (shown in `/stats` and "
                                                       "`/leaderboard`) and gets a receipt in DMs.", inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


ALL_COMMANDS = [ticket_cmd, setchef_cmd, setlogs_cmd, panel_cmd, clockin_cmd, clockout_cmd, staffonline_cmd,
                stats_cmd, leaderboard_cmd, claim_cmd, unclaim_cmd, complete_cmd, close_cmd, add_cmd,
                remove_cmd, rename_cmd, orderinfo_cmd, blacklist_cmd, unblacklist_cmd, list_cmd, listadd_cmd,
                listremove_cmd, queue_cmd, help_cmd]


# ==========================================================================
# Client
# ==========================================================================
class FoodBot(discord.Client):
    def __init__(self, message_content: bool):
        intents = discord.Intents.default()
        intents.message_content = message_content
        super().__init__(intents=intents)
        self.tree = GatedTree(self)
        for cmd in ALL_COMMANDS:
            self.tree.add_command(cmd)

    async def setup_hook(self) -> None:
        for view_cls in PERSISTENT_VIEWS:
            self.add_view(view_cls())

    async def sync_guild(self, guild: discord.Guild) -> None:
        self.tree.copy_global_to(guild=guild)
        try:
            cmds = await self.tree.sync(guild=guild)
            log.info("Synced %d commands to %s", len(cmds), guild.name)
        except discord.HTTPException as exc:
            log.error("Command sync failed for %s: %s", guild.name, exc)

    async def on_ready(self):
        if getattr(self, "_ready_once", False):
            log.info("Reconnected to Discord.")
            return
        self._ready_once = True
        invite = discord.utils.oauth_url(self.user.id, permissions=discord.Permissions(administrator=True),
                                         scopes=("bot", "applications.commands"))
        log.info("Logged in as %s (%s) - in %d server(s)", self.user, self.user.id, len(self.guilds))
        log.info("Typed answers: %s", "ON" if TYPED_INPUT else "OFF (forms only - enable Message Content Intent to allow typing)")
        log.info("Invite link: %s", invite)
        if not self.guilds:
            log.warning("The bot is NOT in any server yet. Open the invite link above to add it.")
        for guild in self.guilds:
            await self.sync_guild(guild)
        stale = [cid for cid, t in store.tickets().items()
                 if (gd := self.get_guild(t["guild_id"])) is not None and gd.get_channel(int(cid)) is None]
        for cid in stale:
            store.delete_ticket(int(cid))
        for t in store.tickets().values():
            t.pop("closing", None)
        store.save()
        for guild in self.guilds:
            await refresh_panels(guild)
        await self.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="🍽️ orders"))
        log.info("%s Order Desk is online and ready.", BRAND)

    async def on_guild_join(self, guild: discord.Guild):
        log.info("Joined %s - syncing commands", guild.name)
        await self.sync_guild(guild)

    async def on_guild_channel_delete(self, channel):
        store.delete_ticket(channel.id)
        channel_locks.pop(channel.id, None)

    async def on_message(self, message: discord.Message):
        if message.author.bot or message.guild is None:
            return
        ticket = store.ticket(message.channel.id)
        if ticket is None or message.author.id != ticket["owner_id"]:
            return
        if ticket["stage"] not in ("address", "screenshot", "payment"):
            return
        if not TYPED_INPUT:
            # without the Message Content intent we can't read what they typed -> point them to the form, once per step
            if ticket.get("hinted") != ticket["stage"]:
                ticket["hinted"] = ticket["stage"]
                store.set_ticket(message.channel.id, ticket)
                button = {"address": "📝 Enter Restaurant & Address", "screenshot": "📸 Upload Screenshot & Total",
                          "payment": "💳 Choose Payment"}[ticket["stage"]]
                try:
                    await message.channel.send(embed=note(
                        f"👆 {message.author.mention} press **{button}** on the step above — it opens a quick form "
                        "where you fill this in (screenshots upload right inside it).", COLOR_BLURPLE))
                except discord.HTTPException:
                    pass
            return
        async with lock_for(message.channel.id):
            ticket = store.ticket(message.channel.id)
            if ticket is None or ticket["stage"] not in ("address", "screenshot", "payment"):
                return
            try:
                await handle_typed_message(message, ticket)
            except discord.HTTPException as exc:
                log.warning("Order message error in %s: %s", message.channel.id, exc)


# ==========================================================================
# Startup
# ==========================================================================
def preflight(token: str) -> Optional[dict]:
    """Ask Discord about the app before connecting. Returns None if the check couldn't run."""
    req = urllib.request.Request(
        "https://discord.com/api/v10/oauth2/applications/@me",
        headers={"Authorization": f"Bot {token}", "User-Agent": "DiscordBot (https://github.com/Rapptz/discord.py, 2)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.load(resp)
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return {"invalid": True}
        log.warning("Pre-check failed (HTTP %s) - continuing", exc.code)
        return None
    except Exception as exc:  # network / SSL problems: just skip the pre-check
        log.warning("Pre-check skipped (%s) - continuing", exc)
        return None
    return {
        "invalid": False,
        "name": data.get("name"),
        "message_content": bool(int(data.get("flags", 0)) & INTENT_MESSAGE_CONTENT),
        "guilds": data.get("bot_approximate_guild_count"),
    }


def pause_before_exit() -> None:
    if os.name == "nt":
        try:
            input("\nPress Enter to close this window...")
        except (EOFError, KeyboardInterrupt):
            pass


def main() -> None:
    global TYPED_INPUT
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass
    discord.utils.setup_logging(level=logging.INFO)
    discord.VoiceClient.warn_nacl = False     # no voice features used - hide noisy warnings
    discord.VoiceClient.warn_dave = False

    if discord.version_info < (2, 7, 0):
        log.error("discord.py %s is too old. Run:  pip install -U \"discord.py>=2.7\"", discord.__version__)
        return pause_before_exit()

    if not TOKEN or TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE":
        log.error("No token. Paste your bot token into TOKEN at the top of main.py.")
        return pause_before_exit()

    info = preflight(TOKEN)
    if info and info["invalid"]:
        log.error("Discord rejected the token. Developer Portal -> Bot -> Reset Token, then paste the new one.")
        return pause_before_exit()

    attempts = [True, False]
    if info is not None:
        log.info("App '%s' found. Message Content Intent: %s. Servers: %s", info["name"],
                 "ENABLED" if info["message_content"] else "disabled", info["guilds"])
        if not info["message_content"]:
            log.warning("Message Content Intent is OFF -> customers answer with pop-up forms. "
                        "To also allow typed answers: Developer Portal -> Bot -> MESSAGE CONTENT INTENT -> Save.")
            attempts = [False]

    for use_mc in attempts:
        TYPED_INPUT = use_mc
        bot = FoodBot(message_content=use_mc)
        try:
            bot.run(TOKEN, log_handler=None)
            return
        except discord.PrivilegedIntentsRequired:
            log.warning("Message Content Intent isn't enabled - restarting in forms-only mode.")
            continue
        except discord.LoginFailure:
            log.error("Discord rejected the token. Developer Portal -> Bot -> Reset Token, then paste the new one.")
            break
        except Exception:
            log.error("Bot crashed:\n%s", traceback.format_exc())
            break
    pause_before_exit()


if __name__ == "__main__":
    main()
