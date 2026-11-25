"""
Food and b4u Order Desk v9 - Discord ticket bot (discord.py 2.7+)

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
import socket
import sys
import time
import traceback
import types
import urllib.error
import urllib.parse
import urllib.request
from logging.handlers import RotatingFileHandler
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import aiohttp
import anthropic
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
FREE_ORDER_STARS = 10                   # vouch stars needed for /free order
NOTIFY_COOLDOWN_SECONDS = 30
# ---- AI support (Claude) --------------------------------------------------
# You don't need an API key: log into Claude with the Anthropic CLI (`ant auth login`) or set
# ANTHROPIC_AUTH_TOKEN. An ANTHROPIC_API_KEY still works too, if you'd rather use one.
AI_MODEL_DEFAULT = "claude-opus-4-6"                      # owner can change with /aisupport
AI_MAX_TOKENS = 350                                       # short replies = fewest tokens
AI_EFFORT = "low"                                         # least thinking = fewest tokens
AI_MAX_INPUT = 600                                        # trim the question to save tokens
AI_OAUTH_BETA = "oauth-2025-04-20"                        # lets a Claude login work on the Messages API
AI_COOLDOWN_SECONDS = 6                                   # per-user, stops spam / runaway cost
AI_MAX_PER_TICKET = 15                                    # hard cap of AI replies per ticket
GEO_USER_AGENT = "FoodAndB4uBot/1.0 (Discord order bot)"
CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
TICKET_COOLDOWN_SECONDS = 10
DATA_FILE = Path(__file__).with_name("foodandb4u_data.json")
LOG_FILE = Path(__file__).with_name("foodb4u.log")
SINGLE_INSTANCE_PORT = 47361             # stops two copies of the bot running at once

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
PAY_ALIASES = {                           # what chefs type in a ticket: .venmo  .ca  .pay ...
    "Cash App": ["cashapp", "cash", "ca", "cashtag"],
    "PayPal": ["paypal", "pp"],
    "Venmo": ["venmo", "ven", "vm"],
    "Zelle": ["zelle", "zel"],
    "Apple Pay": ["applepay", "apple", "ap"],
    "Crypto": ["crypto", "btc", "eth", "ltc", "sol", "usdt"],
}
ALIAS_TO_METHOD = {alias: method for method, aliases in PAY_ALIASES.items() for alias in aliases}
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
        "payinfo": {},           # {user_id: {method: address}}  saved with /set payment
        "buyer_role": None,      # given to customers when their order is completed (/buyer)
        "ai_enabled": False,     # owner turned on AI help for customers in support tickets (/aisupport)
        "ai_model": AI_MODEL_DEFAULT,  # set below if a retired default is stored
        "ai_calls": 0,           # how many AI answers the bot has given (for the owner's info)
        "vouch_channel": None,   # where vouches are posted (/set vouch)
        "vouch_counter": 0,
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
        payload = json.dumps(self.data, indent=2)
        tmp = self.path.with_suffix(".tmp")
        for attempt in range(5):
            try:
                tmp.write_text(payload, "utf-8")
                os.replace(tmp, self.path)
                return
            except OSError:
                time.sleep(0.1 * (attempt + 1))
        try:
            self.path.write_text(payload, "utf-8")
        except OSError as exc:
            log.error("Could not save %s (%s) - is it open in another program?", self.path.name, exc)

    def guild(self, guild_id: int) -> dict:
        g = self.data["guilds"].setdefault(str(guild_id), {})
        for key, value in self.GUILD_DEFAULTS.items():
            if key not in g:
                g[key] = copy.deepcopy(value)
        if g.get("ai_model") in ("claude-sonnet-5-5", "claude-sonnet-5", None):
            g["ai_model"] = AI_MODEL_DEFAULT               # move old default onto the current one
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
        c.setdefault("stars", 0)
        c.setdefault("vouches", 0)
        c.setdefault("free_orders", 0)
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
    try:
        if interaction.type == discord.InteractionType.application_command:
            await interaction.response.defer(ephemeral=True, thinking=True)
        else:
            await interaction.response.defer()
    except discord.NotFound:
        log.warning("A button/command expired before the bot answered (slow internet?) - continuing anyway.")
    except discord.HTTPException as exc:
        if exc.code != 40060:   # 40060 = already acknowledged
            raise


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
    embed.add_field(name="🎁 Rewards", value=(f"Leave a vouch after every order = **+1 ⭐** • "
                                             f"**{FREE_ORDER_STARS} ⭐ = FREE order**"), inline=False)
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
    embed.add_field(name="💵 Customer Pays", value=pays_text(t), inline=True)
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
    stars_part = f" • ⭐ {c.get('stars', 0)}/{FREE_ORDER_STARS} stars" if c else ""
    if not c or not c.get("orders"):
        return "🆕 First order" + stars_part
    return f"🔁 Returning — **{c['orders']}** order(s) • {money(Decimal(c['spent']))} paid" + stars_part


def star_bar(n: int) -> str:
    filled = max(0, min(n, FREE_ORDER_STARS))
    return "⭐" * filled + "⚫" * (FREE_ORDER_STARS - filled)


def stars_line(c: dict) -> str:
    n = c.get("stars", 0)
    tail = ("🎁 **FREE order ready!** Use `/free order` in your next ticket." if n >= FREE_ORDER_STARS
            else f"**{FREE_ORDER_STARS - n}** more vouch(es) for a **FREE order** 🎁")
    return f"{star_bar(n)}\n**{n}/{FREE_ORDER_STARS}** stars — {tail}"


def pays_text(t: dict) -> str:
    if t.get("free"):
        return f"🎁 **FREE ORDER** ({FREE_ORDER_STARS} ⭐)"
    return f"**{money(Decimal(t['due']))}**" if t.get("due") else "—"


def owner_pings(guild: discord.Guild) -> str:
    """Server owner + every (non-bot) role with Administrator."""
    pings = [f"<@{guild.owner_id}>"]
    pings += [r.mention for r in guild.roles
              if r.permissions.administrator and not r.managed and not r.is_default()]
    return " ".join(pings)


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
        if isinstance(error, discord.NotFound) and error.code == 10062:
            log.warning("Button %s expired before the bot answered (slow internet?)", getattr(item, "custom_id", item))
            return
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
            for item in (self.paid, self.placed, self.onway, self.fulladdr, self.payinfo):
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

    @discord.ui.button(label="Full Address", emoji="📍", style=discord.ButtonStyle.primary,
                       custom_id="fb4u:order:fulladdr", row=1)
    async def fulladdr(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_fulladdress(interaction)

    @discord.ui.button(label="AI Assist", emoji="🤖", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:order:aiassist", row=2)
    async def aiassist(self, interaction: discord.Interaction, button: discord.ui.Button):
        if not ai_ready():
            return await send_error(interaction, "AI isn't set up. The owner must log into Claude (`ant auth login`) "
                                                 "or set `ANTHROPIC_AUTH_TOKEN`, then restart the bot.")
        await interaction.response.send_modal(ChefAIModal())

    @discord.ui.button(label="Payment Info", emoji="💸", style=discord.ButtonStyle.success,
                       custom_id="fb4u:order:payinfo", row=1)
    async def payinfo(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_payinfo(interaction)

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
    elif store.guild(guild.id).get("ai_enabled") and ai_ready():
        await channel.send(embed=ai_support_embed(store.guild(guild.id)), view=AISupportView())

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
    if ticket.get("free"):
        ticket["due"] = "0.00"
        await apply_payment(channel, ticket, f"🎁 Free order — {FREE_ORDER_STARS} ⭐ redeemed")
        return
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
        if not ticket.get("screenshot_msg_id"):
            raise discord.NotFound(types.SimpleNamespace(status=404, reason="no screenshot"), "no screenshot")
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
            "💰 Payment Status": "🎁 Free order — nothing to pay" if ticket.get("free") else paid_text(ticket),
            "💵 Customer Pays": pays_text(ticket)}
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
        if delivery_address(ticket):
            embed.add_field(name="🏠 Delivery Address", value=(
                f"```\n{delivery_address(ticket)[:900]}\n```📱 Copy it from the message right below • "
                "📍 **Full Address** finds the exact ZIP / city / state"), inline=False)
        embed.add_field(name="🛠️ Chef Controls", value=(
            "**📍 Full Address** — exact street, city, state & ZIP + map links\n"
            "**💸 Payment Info** — post YOUR saved payment address (from `/set payment`)\n"
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
        if delivery_address(ticket):   # plain message = hold -> Copy Text on mobile copies just the address
            await channel.send(content=delivery_address(ticket)[:2000], allowed_mentions=discord.AllowedMentions.none())
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
        buyer_note = await give_buyer_role(guild, ticket["owner_id"])
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
        if ticket.get("free"):
            embed.add_field(name="🎁 Free Order", value=f"Paid with **{FREE_ORDER_STARS} ⭐** — enjoy!", inline=False)
        if buyer_note:
            embed.add_field(name="🛍️ Buyer Role", value=buyer_note, inline=False)
        embed.add_field(name="🧭 Timeline", value=timeline_text(ticket), inline=False)
        stamp(embed, f"Order #{ticket['number']:04d}")
        await channel.send(content=mention(ticket["owner_id"]), embed=embed, view=TicketControlView(),
                           allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
        prompt = discord.Embed(
            title="⭐ Leave a Vouch & Earn Stars!",
            description=(f"{mention(ticket['owner_id'])}, how was your order with {mention(chef)}?\n"
                         "Press **Leave a Vouch**, pick your stars and upload a **screenshot of your order** "
                         "(the food / delivery confirmation).\n\n"
                         f"🎁 Every vouch = **+1 ⭐** • **{FREE_ORDER_STARS} ⭐ = a FREE order** (`/free order`)"),
            color=COLOR_GOLD,
        )
        prompt.add_field(name="⭐ Your Stars", value=stars_line(c), inline=False)
        vouch_msg = await channel.send(embed=stamp(prompt, f"Order #{ticket['number']:04d}"), view=VouchView())
        ticket["vouch_msg_id"] = vouch_msg.id
        store.set_ticket(channel.id, ticket)

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
        if step == "paid" and ticket.get("free"):
            text = f"🎁 This is a **FREE order** — nothing to pay. {chef} is placing it next!"
        elif step == "paid":
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


def saved_pay(g: dict, user_id: int) -> dict:
    return g["payinfo"].get(str(user_id), {})


def pick_methods(saved: dict, ticket: Optional[dict], wanted: Optional[str]) -> list:
    if wanted:
        return [(wanted, saved[wanted])] if wanted in saved else []
    if ticket and ticket.get("payment"):        # match what the customer picked
        for method in saved:
            if method.lower() in ticket["payment"].lower():
                return [(method, saved[method])]
    return list(saved.items())


def pay_info_embed(chef: discord.Member, methods: list, ticket: Optional[dict]) -> discord.Embed:
    due = money(Decimal(ticket["due"])) if ticket and ticket.get("due") else None
    send = f"**{due}**" if due else "your payment"
    if len(methods) == 1:
        method, address = methods[0]
        embed = discord.Embed(title=f"{dict(PAYMENT_METHODS).get(method, '💳')} {method} — Payment Info",
                              description=f"Send {send} to {chef.mention} on **{method}**:\n```\n{address}\n```",
                              color=COLOR_GREEN)
    else:
        embed = discord.Embed(title="💸 Payment Info",
                              description=f"Send {send} to {chef.mention} with **any** of these:", color=COLOR_GREEN)
        for method, address in methods:
            embed.add_field(name=f"{dict(PAYMENT_METHODS).get(method, '💳')} {method}",
                            value=f"```\n{address}\n```", inline=True)
    if due:
        embed.add_field(name="💵 Amount Due", value=f"**{due}**", inline=True)
    if ticket:
        embed.add_field(name="🆔 Order", value=f"#{ticket['number']:04d}", inline=True)
    embed.add_field(name="🧑‍🍳 Chef", value=chef.mention, inline=True)
    below = "the address message right below this" if len(methods) == 1 else "the address messages right below this"
    embed.add_field(name="📱 Copy on your phone",
                    value=f"**Hold your finger** on {below} → tap **Copy Text**. It copies only the address.",
                    inline=False)
    embed.add_field(name="📸 After you pay",
                    value="Send a **screenshot of the payment** here so your chef can confirm it.", inline=False)
    embed.set_thumbnail(url=chef.display_avatar.url)
    return stamp(embed, f"Order #{ticket['number']:04d}" if ticket else None)


async def post_pay_info(channel, chef: discord.Member, wanted: Optional[str] = None) -> Optional[str]:
    """Post the chef's own saved payment info. Returns an error message, or None on success."""
    g = store.guild(channel.guild.id)
    saved = saved_pay(g, chef.id)
    if not saved:
        return "You haven't saved any payment info yet. Use `/set payment` first — e.g. `/set payment method:Venmo address:973 202 0355`."
    ticket = store.ticket(channel.id)
    if ticket and ticket.get("free"):
        return "This is a 🎁 **FREE order** — the customer doesn't pay anything."
    methods = pick_methods(saved, ticket, wanted)
    if not methods:
        return f"You haven't saved **{wanted}** yet. Use `/set payment` to add it. You have: {', '.join(saved)}."
    await channel.send(content=mention(ticket["owner_id"]) if ticket else None,
                       embed=pay_info_embed(chef, methods, ticket),
                       allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
    # Each address as its own plain message (nothing else in it): on mobile, hold it -> Copy Text copies exactly
    # the address. Text inside embeds can't be copied on mobile.
    for _method, address in methods:
        await channel.send(content=address, allowed_mentions=discord.AllowedMentions.none())
    return None


async def do_payinfo(interaction: discord.Interaction) -> None:
    g = store.guild(interaction.guild.id)
    if not can_use_commands(interaction.user, g):
        return await send_error(interaction, "Only chefs or the owner can send payment info.")
    await ack(interaction)
    error = await post_pay_info(interaction.channel, interaction.user)
    if error:
        await send_error(interaction, error)


async def give_buyer_role(guild: discord.Guild, user_id: int) -> Optional[str]:
    g = store.guild(guild.id)
    role = guild.get_role(g["buyer_role"]) if g["buyer_role"] else None
    if role is None:
        return None
    try:
        member = guild.get_member(user_id) or await guild.fetch_member(user_id)
        if role in member.roles:
            return f"You already have {role.mention} ✅"
        await member.add_roles(role, reason=f"{BRAND}: order completed")
        return f"You got the {role.mention} role! 🎉"
    except discord.Forbidden:
        log.warning("Can't give buyer role %s - bot role must be above it", role.name)
        return f"⚠️ I couldn't give {role.mention} — the owner must drag my bot role **above** it (Server Settings → Roles)."
    except discord.HTTPException as exc:
        log.warning("Buyer role failed: %s", exc)
        return None


STAR_LABELS = {5: "Perfect — amazing order!", 4: "Great order", 3: "Good", 2: "Could be better", 1: "Bad experience"}


def vouch_guard(ticket: Optional[dict], user_id: int) -> Optional[str]:
    if ticket is None:
        return "This ticket no longer exists."
    if user_id != ticket["owner_id"]:
        return "Only the customer who ordered can vouch for this order."
    if not ticket.get("completed"):
        return "You can vouch once your order is complete."
    if ticket.get("vouched") or ticket.get("rating"):
        return "You already vouched for this order. Thank you! 💛"
    return None


class VouchModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="⭐ Leave a Vouch", timeout=900)
        self.stars = discord.ui.Select(placeholder="How many stars?", options=[
            discord.SelectOption(label=f"{n} star{'s' if n > 1 else ''}", value=str(n), emoji="⭐",
                                 description=STAR_LABELS[n]) for n in (5, 4, 3, 2, 1)])
        self.shot = discord.ui.FileUpload(required=True, min_values=1, max_values=1)
        self.comment = discord.ui.TextInput(style=discord.TextStyle.paragraph, required=False, max_length=300,
                                            placeholder="Fast, hot food, great chef… (optional)")
        self.add_item(discord.ui.Label(text="Rating", description="Pick 1–5 stars", component=self.stars))
        self.add_item(discord.ui.Label(text="Screenshot of your order",
                                       description="Your food / the delivery confirmation", component=self.shot))
        self.add_item(discord.ui.Label(text="Comment", description="Say something about your order",
                                       component=self.comment))

    async def on_submit(self, interaction: discord.Interaction):
        score = int(self.stars.values[0]) if self.stars.values else 5
        await submit_vouch(interaction, score, self.shot.values, self.comment.value.strip())

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("VouchModal failed", exc_info=error)
        await send_error(interaction, "Something went wrong posting your vouch. Please try again.")


class VouchView(SafeView):
    def __init__(self, done: bool = False):
        super().__init__(timeout=None)
        if done:
            self.vouch.disabled = True
            self.vouch.label = "Vouched — thank you!"
            self.vouch.style = discord.ButtonStyle.secondary

    @discord.ui.button(label="Leave a Vouch", emoji="⭐", style=discord.ButtonStyle.success,
                       custom_id="fb4u:vouch:open")
    async def vouch(self, interaction: discord.Interaction, button: discord.ui.Button):
        problem = vouch_guard(store.ticket(interaction.channel.id), interaction.user.id)
        if problem:
            return await send_error(interaction, problem)
        await interaction.response.send_modal(VouchModal())


def vouch_embed(number: int, score: int, customer: discord.abc.User, ticket: dict, comment: str,
                c: dict) -> discord.Embed:
    embed = discord.Embed(title=f"⭐ Vouch #{number:04d}",
                          description=f"# {stars(score)}\n**{score}/5** — {STAR_LABELS[score]}",
                          color=COLOR_GOLD)
    embed.add_field(name="👤 Customer", value=customer.mention, inline=True)
    embed.add_field(name="🧑‍🍳 Chef", value=mention(ticket.get("claimed_by")), inline=True)
    embed.add_field(name="🆔 Order", value=f"#{ticket['number']:04d}", inline=True)
    place = restaurant_guess(ticket)
    if place:
        embed.add_field(name="🍔 Restaurant", value=(menu_match(store.guild(ticket["guild_id"]), place) or place)[:1024],
                        inline=True)
    if ticket.get("free"):
        embed.add_field(name="🎁 Order", value="FREE order (stars)", inline=True)
    if comment:
        embed.add_field(name="💬 Comment", value=f">>> {comment}"[:1024], inline=False)
    embed.add_field(name="🎁 Stars", value=f"{customer.mention} got **+1 ⭐** — now has **{c['stars']}** ⭐\n"
                                          f"{star_bar(c['stars'])}", inline=False)
    embed.set_thumbnail(url=customer.display_avatar.url)
    return stamp(embed, f"{c['vouches']} vouch(es) from this customer")


async def submit_vouch(interaction: discord.Interaction, score: int, uploads: list, comment: str) -> None:
    channel = interaction.channel
    await ack(interaction)
    async with lock_for(channel.id):
        ticket = store.ticket(channel.id)
        problem = vouch_guard(ticket, interaction.user.id)
        if problem:
            return await send_error(interaction, problem)
        images = [a for a in uploads if is_image(a)]
        if not images:
            return await send_error(interaction, "That file isn't an image. Upload a **screenshot** (PNG/JPG).")
        guild = channel.guild
        g = store.guild(guild.id)
        g["vouch_counter"] += 1
        number = g["vouch_counter"]
        c = store.customer(guild.id, ticket["owner_id"])
        c["stars"] += 1
        c["vouches"] += 1
        if ticket.get("claimed_by"):
            s = store.stats(guild.id, ticket["claimed_by"])
            s["rating_sum"] += score
            s["rating_count"] += 1
        ticket.update(vouched=True, rating=score)
        store.save()
        store.set_ticket(channel.id, ticket)

        embed = vouch_embed(number, score, interaction.user, ticket, comment, c)
        posted = None
        vch = guild.get_channel(g["vouch_channel"]) if g["vouch_channel"] else None
        if isinstance(vch, discord.TextChannel):
            att = images[0]
            ext = os.path.splitext(att.filename)[1].lower() or ".png"
            try:
                file = await att.to_file(filename=f"vouch_{number:04d}{ext}")
                embed.set_image(url=f"attachment://{file.filename}")
                posted = await vch.send(embed=embed, file=file, allowed_mentions=discord.AllowedMentions.none())
            except discord.HTTPException as exc:
                log.warning("Vouch post failed: %s", exc)

        if ticket.get("vouch_msg_id"):
            try:
                await channel.get_partial_message(ticket["vouch_msg_id"]).edit(view=VouchView(done=True))
            except discord.HTTPException:
                pass
        thanks = discord.Embed(
            title="🙏 Thanks for the vouch!",
            description=(f"{interaction.user.mention} gave {mention(ticket.get('claimed_by'))} **{stars(score)}** "
                         f"and earned **+1 ⭐**!"),
            color=COLOR_GOLD,
        )
        thanks.add_field(name="⭐ Your Stars", value=stars_line(c), inline=False)
        if posted:
            thanks.add_field(name="📣 Posted", value=f"[See your vouch in {vch.mention}]({posted.jump_url})", inline=False)
        elif not vch:
            thanks.add_field(name="📣 Posted", value="*No vouch channel set yet — the owner can use `/set vouch`.*",
                             inline=False)
        await channel.send(embed=stamp(thanks, f"Order #{ticket['number']:04d}"))


# ==========================================================================
# Full address lookup (US Census geocoder first, OpenStreetMap as fallback; both free, no key)
# ==========================================================================
UNIT_RE = re.compile(r"(?:,\s*|\s+)((?:apt|apartment|unit|suite|ste|rm|room|lot|#)\.?\s*#?\s*[\w-]+)\b", re.I)


def delivery_address(t: dict) -> str:
    """The address part only (typed answers may start with the restaurant on the first line)."""
    text = (t.get("address") or "").strip()
    if t.get("restaurant"):
        return text
    lines = [ln for ln in text.splitlines() if ln.strip()]
    return "\n".join(lines[1:]) if len(lines) > 1 else text


def split_unit(text: str) -> tuple[str, Optional[str]]:
    m = UNIT_RE.search(text)
    if not m:
        return text, None
    return (text[:m.start()] + text[m.end():]).strip(" ,"), m.group(1).upper()


def _match_score(typed_upper: str, r: dict) -> int:
    score = 0
    if r.get("zip") and r["zip"] in typed_upper:
        score += 4
    if r.get("city") and r["city"].upper() in typed_upper:
        score += 2
    if r.get("state") and re.search(rf"\b{re.escape(r['state'].upper())}\b", typed_upper):
        score += 1
    return score


async def _get_json(session: aiohttp.ClientSession, url: str, params: dict):
    async with session.get(url, params=params, headers={"User-Agent": GEO_USER_AGENT}) as resp:
        if resp.status != 200:
            return None
        return await resp.json(content_type=None)


async def lookup_address(raw: str) -> dict:
    """Find the exact street, city, state and ZIP for what the customer typed."""
    one_line = " ".join(raw.replace("\n", ", ").split())
    clean, unit = split_unit(one_line)
    results, errors = [], 0
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as session:
        try:
            data = await _get_json(session, CENSUS_URL,
                                   {"address": clean, "benchmark": "Public_AR_Current", "format": "json"})
            for match in ((data or {}).get("result") or {}).get("addressMatches", [])[:5]:
                comp = match.get("addressComponents", {})
                results.append({
                    "street": match["matchedAddress"].split(",")[0].strip(), "city": comp.get("city"),
                    "state": comp.get("state"), "zip": comp.get("zip"), "county": None,
                    "lat": match.get("coordinates", {}).get("y"), "lon": match.get("coordinates", {}).get("x"),
                    "source": "US Census Bureau — exact match",
                })
        except (aiohttp.ClientError, asyncio.TimeoutError, KeyError, ValueError, TypeError) as exc:
            errors += 1
            log.warning("Census lookup failed: %s", exc)
        if not results:
            try:
                data = await _get_json(session, NOMINATIM_URL, {"q": clean, "format": "jsonv2", "addressdetails": 1,
                                                                "countrycodes": "us", "limit": 5})
                for item in data or []:
                    a = item.get("address", {})
                    state = (a.get("ISO3166-2-lvl4") or "").split("-")[-1] or a.get("state")
                    street = " ".join(x for x in (a.get("house_number"), a.get("road")) if x)
                    results.append({
                        "street": (street or item.get("display_name", "").split(",")[0]).upper(),
                        "city": (a.get("city") or a.get("town") or a.get("village") or a.get("hamlet")
                                 or a.get("suburb") or "").upper() or None,
                        "state": state.upper() if state else None, "zip": a.get("postcode"),
                        "county": a.get("county"), "lat": item.get("lat"), "lon": item.get("lon"),
                        "source": "OpenStreetMap — best guess, double-check it",
                    })
            except (aiohttp.ClientError, asyncio.TimeoutError, KeyError, ValueError, TypeError) as exc:
                errors += 1
                log.warning("OpenStreetMap lookup failed: %s", exc)
    if not results:
        return {"found": False, "typed": raw, "unit": unit, "service_down": errors >= 2}
    typed_upper = one_line.upper()
    for r in results:
        r["score"] = _match_score(typed_upper, r)
    results.sort(key=lambda r: -r["score"])           # stable: keeps the service's order on ties
    for r in results:
        street = f"{r['street']} {unit}" if unit else r["street"]
        tail = " ".join(x for x in (r.get("state"), r.get("zip")) if x)
        r["full"] = ", ".join(x for x in (street, r.get("city"), tail) if x)
    best = results[0]
    sure = len(results) == 1 or best["score"] > results[1]["score"]
    return {"found": True, "best": best, "others": [] if sure else results[1:3], "count": len(results),
            "sure": sure, "typed": raw, "unit": unit}


def maps_links(text: str) -> str:
    q = urllib.parse.quote_plus(text)
    return (f"[Google Maps](https://www.google.com/maps/search/?api=1&query={q}) • "
            f"[Apple Maps](https://maps.apple.com/?q={q})")


def full_address_embed(t: dict, geo: dict) -> discord.Embed:
    if not geo["found"]:
        why = ("The address lookup services aren't answering right now — try again in a minute."
               if geo.get("service_down") else
               "I couldn't find an exact match. Ask the customer for the full street, city, state and ZIP.")
        embed = discord.Embed(title="📍 Address Not Found", description=why, color=COLOR_ORANGE)
        embed.add_field(name="✍️ Customer typed", value=f">>> {geo['typed']}"[:1024], inline=False)
        embed.add_field(name="🗺️ Search it", value=maps_links(geo["typed"]), inline=False)
        return stamp(embed, f"Order #{t['number']:04d}")
    b = geo["best"]
    embed = discord.Embed(title="📍 Full Address", color=COLOR_GREEN if geo["sure"] else COLOR_GOLD,
                          description=f"```\n{b['full']}\n```")
    embed.add_field(name="🏠 Street", value=b["street"] + (f" {geo['unit']}" if geo.get("unit") else ""), inline=True)
    embed.add_field(name="🏙️ City", value=b.get("city") or "—", inline=True)
    embed.add_field(name="🗺️ State", value=b.get("state") or "—", inline=True)
    embed.add_field(name="📮 ZIP", value=f"**{b['zip']}**" if b.get("zip") else "—", inline=True)
    if b.get("county"):
        embed.add_field(name="🌎 County", value=b["county"], inline=True)
    embed.add_field(name="🎯 Match", value=b["source"] + ("" if geo["sure"] else
                    f"\n⚠️ **{geo['count']} possible addresses** — make sure it's the right one"), inline=False)
    if geo["others"]:
        embed.add_field(name="🔎 Other possible matches", value="\n".join(f"• {o['full']}" for o in geo["others"]),
                        inline=False)
    embed.add_field(name="✍️ Customer typed", value=f">>> {geo['typed']}"[:1024], inline=False)
    if t.get("notes"):
        embed.add_field(name="📝 Delivery notes", value=t["notes"][:1024], inline=False)
    embed.add_field(name="🗺️ Open in maps", value=maps_links(b["full"]), inline=False)
    embed.add_field(name="📱 Copy", value="Hold the address text above this embed → **Copy Text**.", inline=False)
    return stamp(embed, f"Order #{t['number']:04d}")


async def do_fulladdress(interaction: discord.Interaction) -> None:
    channel = interaction.channel
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None:
        return await send_error(interaction, "This ticket no longer exists.")
    if not is_staff(interaction.user, store.guild(channel.guild.id)):
        return await send_error(interaction, "Only chefs or the owner can look up the address.")
    address = delivery_address(ticket)
    if not address:
        return await send_error(interaction, "The customer hasn't entered an address yet.")
    await interaction.response.defer(ephemeral=True, thinking=True)
    geo = ticket.get("geo") if ticket.get("geo_for") == address else None
    if geo is None:
        geo = await lookup_address(address)
        fresh = store.ticket(channel.id)
        if fresh is not None and not geo.get("service_down"):
            fresh.update(geo=geo, geo_for=address)
            store.set_ticket(channel.id, fresh)
    content = geo["best"]["full"] if geo["found"] else address
    await interaction.followup.send(content=content[:2000], embed=full_address_embed(ticket, geo), ephemeral=True)


# ==========================================================================
# AI support, powered by Claude (optional — needs the ANTHROPIC_API_KEY env var)
# ==========================================================================
_ai_client: Optional[anthropic.AsyncAnthropic] = None
ai_cooldowns: dict[int, float] = {}

CUSTOMER_SYSTEM = (
    "Support assistant for {brand}, a Discord food-ordering service: customers order via a ticket and pay "
    "{price_rule} of their total; {free_stars} vouch stars = a free order. Answer in 1-3 short sentences, "
    "friendly. Only help with using the service. Send any payment/refund/order problem to staff. Never ask for "
    "passwords or card numbers; never invent prices or order details; refuse anything illegal."
)
CHEF_SYSTEM = (
    "Help a staff member handle a food-order ticket for {brand}. Be concise (a short summary, a drafted reply, "
    "or the next step). Use only the details given; don't invent prices or addresses; refuse anything illegal."
)


def credential_source() -> Optional[str]:
    """Which Claude credential the bot can see, if any (for status messages)."""
    if os.getenv("ANTHROPIC_API_KEY", "").strip():
        return "API key (ANTHROPIC_API_KEY)"
    if os.getenv("ANTHROPIC_AUTH_TOKEN", "").strip():
        return "Claude login token (ANTHROPIC_AUTH_TOKEN)"
    home = os.path.expanduser("~")
    candidates = [os.getenv("ANTHROPIC_CONFIG_DIR", "").strip(),
                  os.path.join(home, ".config", "anthropic"),
                  os.path.join(os.getenv("XDG_CONFIG_HOME", ""), "anthropic") if os.getenv("XDG_CONFIG_HOME") else "",
                  os.path.join(os.getenv("APPDATA", ""), "anthropic") if os.getenv("APPDATA") else ""]
    for base in filter(None, candidates):
        try:
            if os.path.isdir(base) and any(True for _ in os.scandir(base)):
                return "Claude login (`ant auth login`)"
        except OSError:
            continue
    return None


def ai_ready() -> bool:
    return credential_source() is not None


def get_ai_client() -> Optional[anthropic.AsyncAnthropic]:
    """Build a client from whatever credential exists: API key, login token, or on-disk Claude login."""
    global _ai_client
    if _ai_client is not None:
        return _ai_client
    if credential_source() is None:
        return None
    key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    token = os.getenv("ANTHROPIC_AUTH_TOKEN", "").strip()
    try:
        if key:
            _ai_client = anthropic.AsyncAnthropic(api_key=key)
        elif token:
            _ai_client = anthropic.AsyncAnthropic(auth_token=token,
                                                  default_headers={"anthropic-beta": AI_OAUTH_BETA})
        else:  # on-disk Claude login (OAuth) — SDK resolves it; add the beta so the Messages API accepts it
            _ai_client = anthropic.AsyncAnthropic(default_headers={"anthropic-beta": AI_OAUTH_BETA})
    except anthropic.AnthropicError as exc:
        log.warning("Could not start the AI client: %s", exc)
        return None
    return _ai_client


async def ai_ask(guild_id: int, system: str, question: str) -> tuple[bool, str]:
    """Ask Claude. Returns (ok, text). Never raises — turns every error into a friendly message."""
    client = get_ai_client()
    if client is None:
        return False, ("🤖 AI help isn't set up yet. Log into Claude (`ant auth login`) or set "
                       "`ANTHROPIC_AUTH_TOKEN`, then restart the bot.")
    g = store.guild(guild_id)
    model = g.get("ai_model") or AI_MODEL_DEFAULT
    # No `thinking` param -> Opus 4.6 answers without a thinking budget = fewest tokens.
    base = dict(model=model, max_tokens=AI_MAX_TOKENS, system=system,
                messages=[{"role": "user", "content": question[:AI_MAX_INPUT]}])
    resp = None
    for kwargs in ({**base, "output_config": {"effort": AI_EFFORT}}, base):
        try:
            resp = await client.messages.create(**kwargs)
            break
        except anthropic.BadRequestError as exc:
            if kwargs is base:   # already stripped the optional field -> real problem
                log.warning("AI bad request: %s", exc)
                return False, "🤖 The AI couldn't answer that one. A staff member will help you."
            log.info("AI: retrying without output_config (%s)", exc)
            continue             # retry once without output_config (older models reject it)
        except anthropic.AuthenticationError:
            return False, ("🤖 Claude login failed. Log in again (`ant auth login`) or check "
                           "`ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY`, then restart.")
        except anthropic.RateLimitError:
            return False, "🤖 The AI is busy right now — try again in a moment."
        except anthropic.APIError as exc:
            log.warning("AI call failed: %s", exc)
            return False, "🤖 The AI couldn't answer right now. A staff member will help you."
        except Exception as exc:  # never let the AI crash the bot
            log.warning("AI unexpected error: %s", exc)
            return False, "🤖 The AI couldn't answer right now. A staff member will help you."
    if resp is None:
        return False, "🤖 The AI couldn't answer right now. A staff member will help you."
    if resp.stop_reason == "refusal":
        return False, "🤖 I can't help with that one — a staff member will take it from here."
    text = "".join(getattr(b, "text", "") for b in resp.content if getattr(b, "type", "") == "text").strip()
    if not text:
        return False, "🤖 I didn't catch that — could you rephrase, or wait for a staff member?"
    g["ai_calls"] = g.get("ai_calls", 0) + 1
    store.save()
    return True, text[:3900]


def ai_cooldown_left(user_id: int) -> float:
    return ai_cooldowns.get(user_id, 0) + AI_COOLDOWN_SECONDS - time.monotonic()


def order_context(t: dict) -> str:
    g = store.guild(t["guild_id"])
    lines = [f"Order #{t['number']:04d} ({t['kind']})", f"Status: {order_status(t) if t['kind'] != 'support' else 'support ticket'}"]
    if t.get("restaurant"):
        lines.append(f"Restaurant: {t['restaurant']}")
    # city only, not the full street address, to keep personal info out of the API call
    addr = delivery_address(t)
    if addr:
        parts = [x.strip() for x in addr.replace("\n", ",").split(",") if x.strip()]
        if len(parts) >= 2:
            lines.append(f"Delivery area: {parts[-2]}")
    if t.get("total"):
        lines.append(f"Order total: {money(Decimal(t['total']))}")
    if t.get("due"):
        lines.append(f"Customer pays: {money(Decimal(t['due']))}")
    if t.get("payment"):
        lines.append(f"Payment method: {t['payment']}")
    if t.get("free"):
        lines.append("This is a FREE reward order.")
    return "\n".join(lines)


async def run_customer_ai(interaction: discord.Interaction, question: str) -> None:
    channel = interaction.channel
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None:
        return await send_error(interaction, "This only works inside a ticket.")
    g = store.guild(channel.guild.id)
    if not g.get("ai_enabled"):
        return await send_error(interaction, "AI help isn't turned on here. A staff member will help you shortly.")
    if ticket.get("ai_used", 0) >= AI_MAX_PER_TICKET:
        return await send_error(interaction, "The AI has helped a lot in this ticket already — a staff member will take over now.")
    left = ai_cooldown_left(interaction.user.id)
    if left > 0:
        return await send_error(interaction, f"One sec — try again in {left:.0f}s.")
    ai_cooldowns[interaction.user.id] = time.monotonic()
    await ack(interaction)

    system = CUSTOMER_SYSTEM.format(brand=BRAND, price_rule=PRICE_RULE, free_stars=FREE_ORDER_STARS)
    ok, answer = await ai_ask(channel.guild.id, system, question)
    ticket = store.ticket(channel.id)
    if ticket is not None:
        ticket["ai_used"] = ticket.get("ai_used", 0) + 1
        store.set_ticket(channel.id, ticket)
    embed = discord.Embed(title="🤖 AI Support", color=COLOR_BLURPLE if ok else COLOR_ORANGE,
                          description=answer)
    embed.add_field(name="❓ You asked", value=f">>> {question[:300]}", inline=False)
    embed.add_field(name="🙋 Need a person?", value="Press **Talk to a human** below and a staff member will come help.",
                    inline=False)
    embed.set_footer(text=f"{BRAND} • AI assistant — a staff member can always help too")
    await interaction.followup.send(embed=embed, view=AISupportView())


async def run_chef_ai(interaction: discord.Interaction, question: str) -> None:
    channel = interaction.channel
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None:
        return await send_error(interaction, "Use this inside a ticket.")
    if not is_staff(interaction.user, store.guild(channel.guild.id)):
        return await send_error(interaction, "Only chefs or the owner can use AI assist.")
    if not ai_ready():
        return await send_error(interaction, "AI isn't set up. The owner must log into Claude (`ant auth login`) "
                                             "or set `ANTHROPIC_AUTH_TOKEN`, then restart the bot.")
    left = ai_cooldown_left(interaction.user.id)
    if left > 0:
        return await send_error(interaction, f"One sec — try again in {left:.0f}s.")
    ai_cooldowns[interaction.user.id] = time.monotonic()
    await ack(interaction)
    prompt = f"Order details:\n{order_context(ticket)}\n\nChef's request: {question}"
    ok, answer = await ai_ask(channel.guild.id, CHEF_SYSTEM.format(brand=BRAND), prompt)
    embed = discord.Embed(title="🤖 AI Assist (chefs only)", color=COLOR_BLUE if ok else COLOR_ORANGE,
                          description=answer)
    embed.add_field(name="🧑‍🍳 You asked", value=f">>> {question[:300]}", inline=False)
    embed.set_footer(text=f"{BRAND} • Only you can see this — double-check before sending to the customer")
    await interaction.followup.send(embed=embed, ephemeral=True)


class CustomerAIModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="🤖 Ask AI Support", timeout=600)
        self.q = discord.ui.TextInput(style=discord.TextStyle.paragraph, max_length=AI_MAX_INPUT,
                                      placeholder="e.g. How much will I pay for a $40 order? How long does delivery take?")
        self.add_item(discord.ui.Label(text="Your question", description="Ask anything about ordering with us",
                                       component=self.q))

    async def on_submit(self, interaction: discord.Interaction):
        await run_customer_ai(interaction, self.q.value.strip())

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("CustomerAIModal failed", exc_info=error)
        await send_error(interaction, "Couldn't reach the AI. A staff member will help you shortly.")


class ChefAIModal(discord.ui.Modal):
    def __init__(self):
        super().__init__(title="🤖 AI Assist", timeout=600)
        self.q = discord.ui.TextInput(style=discord.TextStyle.paragraph, max_length=AI_MAX_INPUT,
                                      placeholder="e.g. Summarize this order • Draft a polite update for the customer")
        self.add_item(discord.ui.Label(text="What do you need?", description="Summary, a drafted reply, next step…",
                                       component=self.q))

    async def on_submit(self, interaction: discord.Interaction):
        await run_chef_ai(interaction, self.q.value.strip())

    async def on_error(self, interaction: discord.Interaction, error: Exception):
        log.exception("ChefAIModal failed", exc_info=error)
        await send_error(interaction, "Couldn't reach the AI. Try again in a moment.")


class AISupportView(SafeView):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Ask AI", emoji="🤖", style=discord.ButtonStyle.primary, custom_id="fb4u:ai:ask")
    async def ask(self, interaction: discord.Interaction, button: discord.ui.Button):
        g = store.guild(interaction.guild.id)
        if not g.get("ai_enabled"):
            return await send_error(interaction, "AI help isn't turned on here — a staff member will help you shortly.")
        await interaction.response.send_modal(CustomerAIModal())

    @discord.ui.button(label="Talk to a human", emoji="🙋", style=discord.ButtonStyle.secondary,
                       custom_id="fb4u:ai:human")
    async def human(self, interaction: discord.Interaction, button: discord.ui.Button):
        g = store.guild(interaction.guild.id)
        ping = role_mention(g["chef_role"] or g["staff_role"])
        await interaction.response.send_message(
            content=ping if (g["chef_role"] or g["staff_role"]) else None,
            embed=note(f"🙋 {interaction.user.mention} would like a human to help — a staff member will be with you soon!",
                       COLOR_GOLD),
            allowed_mentions=discord.AllowedMentions(roles=True, users=False, everyone=False))


def ai_support_embed(g: dict) -> discord.Embed:
    embed = discord.Embed(
        title="🤖 AI Support is here to help",
        description=("While you wait for a staff member, press **Ask AI** to get instant answers about ordering, "
                     "prices, delivery and rewards.\nPrefer a person? Press **Talk to a human** any time."),
        color=COLOR_BLURPLE,
    )
    embed.add_field(name="💡 Try asking", value="• How much do I pay for a $45 order?\n• How do I earn a free order?\n"
                                               "• How long does delivery take?", inline=False)
    return stamp(embed)


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
PUBLIC_COMMANDS = {"free", "stars"}      # everyone can use these; all others are owner/chef only


class GatedTree(app_commands.CommandTree):
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.type == discord.InteractionType.autocomplete:
            return (interaction.guild is not None and isinstance(interaction.user, discord.Member)
                    and can_use_commands(interaction.user, store.guild(interaction.guild.id)))
        if interaction.guild is None or not isinstance(interaction.user, discord.Member):
            await send_error(interaction, "Commands only work inside a server.")
            return False
        g = store.guild(interaction.guild.id)
        if can_use_commands(interaction.user, g) or (interaction.data or {}).get("name") in PUBLIC_COMMANDS:
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


PAY_CHOICES = [app_commands.Choice(name=f"{emoji} {name}", value=name) for name, emoji in PAYMENT_METHODS
               if name in PAY_ALIASES]


def saved_pay_embed(member: discord.Member, saved: dict, title: str) -> discord.Embed:
    embed = discord.Embed(title=title, color=COLOR_GREEN)
    for method, address in saved.items():
        embed.add_field(name=f"{dict(PAYMENT_METHODS).get(method, '💳')} {method}",
                        value=f"```\n{address}\n```Type `.{PAY_ALIASES[method][0]}` in a ticket", inline=True)
    if not saved:
        embed.description = "*Nothing saved yet.* Use `/set payment` to add one."
    how = ("Type `.venmo`, `.cashapp`, `.paypal`, `.zelle`, `.applepay`, `.crypto` in a ticket — or `.pay` to send the "
           "one the customer picked. You can also press **💸 Payment Info** or use `/pay`.")
    if not TYPED_INPUT:
        how += ("\n⚠️ Dot-commands need the **Message Content Intent** (Developer Portal → Bot). "
                "Until then use **💸 Payment Info** or `/pay`.")
    embed.add_field(name="💡 How to send it", value=how, inline=False)
    embed.set_thumbnail(url=member.display_avatar.url)
    return stamp(embed, "Only you can send your own payment info")


set_group = app_commands.Group(name="set", description="Save your payment info or the vouch channel",
                               guild_only=True)


@set_group.command(name="payment", description="Save your payment info (Venmo, Cash App…) to send in tickets")
@app_commands.describe(method="Payment app", address="Your payment address: phone number, $cashtag, @username, email or wallet")
@app_commands.choices(method=PAY_CHOICES)
async def set_cmd(interaction: discord.Interaction, method: app_commands.Choice[str],
                  address: app_commands.Range[str, 2, 100]):
    address = address.replace("`", "").strip()
    if len(address) < 2:
        return await send_error(interaction, "That address is too short.")
    g = store.guild(interaction.guild.id)
    saved = g["payinfo"].setdefault(str(interaction.user.id), {})
    old = saved.get(method.value)
    saved[method.value] = address
    store.save()
    embed = saved_pay_embed(interaction.user, saved, "✅ Payment Info Saved")
    embed.description = (f"**{method.value}** set to `{address}`" + (f" (was `{old}`)" if old and old != address else "")
                         + f"\nNext time type **`.{PAY_ALIASES[method.value][0]}`** in a ticket and I'll send it.")
    await interaction.response.send_message(embed=embed, ephemeral=True)


@set_group.command(name="vouch", description="Pick the channel where vouches are posted")
@app_commands.describe(channel="The vouches channel")
@owner_only()
async def set_vouch_cmd(interaction: discord.Interaction, channel: discord.TextChannel):
    g = store.guild(interaction.guild.id)
    g["vouch_channel"] = channel.id
    store.save()
    embed = discord.Embed(title="⭐ Vouch Channel Set", color=COLOR_GOLD,
                          description=(f"Vouches will be posted in {channel.mention}.\n\n"
                                       "After an order is completed the customer presses **Leave a Vouch**, picks "
                                       "1–5 stars and uploads a screenshot. Each vouch gives them **+1 ⭐**; "
                                       f"**{FREE_ORDER_STARS} ⭐** = a FREE order with `/free order`."))
    embed.add_field(name="🛍️ Buyer Role", value=role_mention(g["buyer_role"]) + ("" if g["buyer_role"] else
                                                                                 " — set it with `/buyer`"), inline=True)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="unset", description="Delete one of your saved payment methods")
@app_commands.choices(method=PAY_CHOICES)
@app_commands.guild_only()
async def unset_cmd(interaction: discord.Interaction, method: app_commands.Choice[str]):
    g = store.guild(interaction.guild.id)
    saved = g["payinfo"].get(str(interaction.user.id), {})
    if saved.pop(method.value, None) is None:
        return await send_error(interaction, f"You don't have **{method.value}** saved.")
    store.save()
    await interaction.response.send_message(
        embed=saved_pay_embed(interaction.user, saved, f"🗑️ Removed {method.value}"), ephemeral=True)


@app_commands.command(name="mypay", description="See the payment info you've saved")
@app_commands.guild_only()
async def mypay_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    await interaction.response.send_message(
        embed=saved_pay_embed(interaction.user, saved_pay(g, interaction.user.id), "💸 Your Payment Info"),
        ephemeral=True)


@app_commands.command(name="pay", description="Send your saved payment info in this channel")
@app_commands.describe(method="Which one (leave empty to send the customer's pick, or all of them)")
@app_commands.choices(method=PAY_CHOICES)
@app_commands.guild_only()
async def pay_cmd(interaction: discord.Interaction, method: Optional[app_commands.Choice[str]] = None):
    await ack(interaction)
    error = await post_pay_info(interaction.channel, interaction.user, method.value if method else None)
    if error:
        return await send_error(interaction, error)
    await finish(interaction, "✅ Payment info sent.")


@app_commands.command(name="buyer", description="Set the role customers get when their order is completed")
@app_commands.describe(role="The buyer role")
@app_commands.guild_only()
@owner_only()
async def buyer_cmd(interaction: discord.Interaction, role: discord.Role):
    if role.managed or role.is_default():
        return await send_error(interaction, "Pick a normal role (not @everyone or a bot role).")
    g = store.guild(interaction.guild.id)
    g["buyer_role"] = role.id
    store.save()
    me = interaction.guild.me
    warn = "" if me.top_role > role else ("\n\n⚠️ My bot role is **below** this role, so I can't give it yet. "
                                          "Drag my role above it in Server Settings → Roles.")
    embed = discord.Embed(title="🛍️ Buyer Role Set", color=COLOR_GREEN,
                          description=(f"Customers get {role.mention} automatically when their order is completed.\n"
                                       f"Only buyers can use `/free order` (with {FREE_ORDER_STARS} ⭐).{warn}"))
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="stars", description="See how many vouch stars you have")
@app_commands.describe(member="Check someone else (chefs/owner only)")
@app_commands.guild_only()
async def stars_cmd(interaction: discord.Interaction, member: Optional[discord.Member] = None):
    g = store.guild(interaction.guild.id)
    target = member or interaction.user
    if target.id != interaction.user.id and not can_use_commands(interaction.user, g):
        return await send_error(interaction, "You can only check your own stars.")
    c = store.customer(interaction.guild.id, target.id)
    embed = discord.Embed(title=f"⭐ Stars — {target.display_name}", color=COLOR_GOLD,
                          description=stars_line(c))
    embed.add_field(name="📝 Vouches", value=str(c["vouches"]), inline=True)
    embed.add_field(name="🛍️ Orders", value=str(c["orders"]), inline=True)
    embed.add_field(name="🎁 Free orders used", value=str(c["free_orders"]), inline=True)
    embed.add_field(name="💡 How it works", value=(f"Leave a vouch after every completed order = **+1 ⭐**.\n"
                                                   f"At **{FREE_ORDER_STARS} ⭐** open an order ticket and type "
                                                   "`/free order`."), inline=False)
    embed.set_thumbnail(url=target.display_avatar.url)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="givestars", description="Add or remove vouch stars from a member")
@app_commands.describe(member="Who", amount="How many (use a negative number to remove)")
@app_commands.guild_only()
@owner_only()
async def givestars_cmd(interaction: discord.Interaction, member: discord.Member,
                        amount: app_commands.Range[int, -100, 100]):
    c = store.customer(interaction.guild.id, member.id)
    c["stars"] = max(0, c["stars"] + amount)
    store.save()
    embed = discord.Embed(title="⭐ Stars Updated", color=COLOR_GOLD,
                          description=f"{'Gave' if amount >= 0 else 'Removed'} **{abs(amount)}** ⭐ "
                                      f"{'to' if amount >= 0 else 'from'} {member.mention}.\n\n{stars_line(c)}")
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


free_group = app_commands.Group(name="free", description="Rewards — redeem your vouch stars", guild_only=True)


@free_group.command(name="order", description=f"Use {FREE_ORDER_STARS} vouch stars to make this order FREE")
async def free_order_cmd(interaction: discord.Interaction):
    channel, user = interaction.channel, interaction.user
    g = store.guild(interaction.guild.id)
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None or ticket["kind"] == "support":
        return await send_error(interaction, "Use `/free order` inside your **order ticket** "
                                             "(open one with **Create Order** first).")
    if user.id != ticket["owner_id"]:
        return await send_error(interaction, "Only the customer who opened this ticket can redeem a free order.")
    if g["buyer_role"] and not has_role(user, g["buyer_role"]) and not is_owner(user):
        return await send_error(interaction, f"You need the {role_mention(g['buyer_role'])} role — "
                                             "you get it after your first completed order.")
    if ticket.get("free"):
        return await send_error(interaction, "This order is already a 🎁 **FREE order**.")
    if ticket.get("completed"):
        return await send_error(interaction, "This order is already completed — use `/free order` on your next one.")
    c = store.customer(interaction.guild.id, user.id)
    if c["stars"] < FREE_ORDER_STARS:
        embed = discord.Embed(title="⭐ Not enough stars yet", color=COLOR_ORANGE, description=stars_line(c))
        embed.add_field(name="💡 Earn stars", value="Leave a **vouch** after every completed order = **+1 ⭐**.",
                        inline=False)
        return await interaction.response.send_message(embed=stamp(embed), ephemeral=True)

    await ack(interaction)
    async with lock_for(channel.id):
        ticket = store.ticket(channel.id)
        if ticket is None or ticket.get("free"):
            return await send_error(interaction, "This order is already a 🎁 **FREE order**.")
        c["stars"] -= FREE_ORDER_STARS
        c["free_orders"] += 1
        ticket.update(free=True, free_at=int(time.time()))
        if ticket.get("due"):
            ticket["due"] = "0.00"
        store.save()
        store.set_ticket(channel.id, ticket)

        new_name = f"{slugify(user.name)}-free-order"
        renamed = True
        try:
            await channel.edit(name=new_name, reason=f"{BRAND}: free order redeemed by {user}")
        except discord.HTTPException as exc:
            renamed = False
            log.warning("Free-order rename failed: %s", exc)

        if ticket["stage"] in ("address", "confirm", "screenshot"):
            next_step = "Finish the steps above — when you send your total you **won't be charged**."
        elif ticket["stage"] == "payment":
            next_step = "Skipping payment — your order goes straight to the kitchen. 🔥"
        else:
            next_step = "Your order is already with the kitchen — the price is now **$0.00**."
        embed = discord.Embed(
            title="🎁 FREE ORDER REDEEMED!",
            description=(f"{user.mention} just cashed in **{FREE_ORDER_STARS} ⭐** for a **FREE order**! 🎉\n"
                         f"Owners — this order is on the house."),
            color=COLOR_GOLD,
        )
        embed.add_field(name="👤 Customer", value=user.mention, inline=True)
        embed.add_field(name="🆔 Order", value=f"#{ticket['number']:04d}", inline=True)
        embed.add_field(name="🎁 Free orders used", value=str(c["free_orders"]), inline=True)
        embed.add_field(name="⭐ Stars left", value=stars_line(c), inline=False)
        embed.add_field(name="🏷️ Ticket", value=f"Renamed to `{new_name}`" if renamed else "*Couldn't rename the channel*",
                        inline=True)
        embed.add_field(name="📋 What happens now", value=next_step, inline=False)
        embed.set_thumbnail(url=user.display_avatar.url)
        await channel.send(content=f"🎁 {owner_pings(channel.guild)}", embed=stamp(embed, f"Order #{ticket['number']:04d}"),
                           allowed_mentions=discord.AllowedMentions(users=True, roles=True, everyone=False))

        if ticket["stage"] == "payment":
            await apply_payment(channel, ticket, f"🎁 Free order — {FREE_ORDER_STARS} ⭐ redeemed")
        elif ticket.get("summary_msg_id"):
            await update_summary(channel, ticket, ClaimView(claimed=bool(ticket.get("claimed_by"))))
    await finish(interaction, "🎉 Free order redeemed!")


notify_cooldowns: dict[int, float] = {}


def link_view(url: str, label: str, emoji: str) -> discord.ui.View:
    view = discord.ui.View(timeout=None)
    view.add_item(discord.ui.Button(style=discord.ButtonStyle.link, url=url, label=label, emoji=emoji))
    return view


@app_commands.command(name="aisupport", description="Turn AI support for customers on or off")
@app_commands.describe(switch="on or off", model="Which Claude model to use (optional)")
@app_commands.choices(switch=[app_commands.Choice(name="on", value="on"), app_commands.Choice(name="off", value="off")])
@app_commands.guild_only()
@owner_only()
async def aisupport_cmd(interaction: discord.Interaction, switch: app_commands.Choice[str],
                        model: Optional[str] = None):
    g = store.guild(interaction.guild.id)
    g["ai_enabled"] = switch.value == "on"
    if model:
        g["ai_model"] = model.strip()
    store.save()
    on = g["ai_enabled"]
    embed = discord.Embed(title="🤖 AI Support " + ("Enabled" if on else "Disabled"),
                          color=COLOR_GREEN if on else COLOR_DARK,
                          description=("Customers now get an **Ask AI** helper in support tickets. 🎉" if on else
                                       "AI support for customers is now off. Chefs can still use **AI Assist** / `/ai`."))
    src = credential_source()
    embed.add_field(name="🔐 Claude login", value=f"✅ {src}" if src else
                    "❌ **Not logged in** — run `ant auth login` (or set `ANTHROPIC_AUTH_TOKEN`), then restart", inline=True)
    embed.add_field(name="🧠 Model", value=f"`{g['ai_model']}`", inline=True)
    embed.add_field(name="📊 AI answers given", value=str(g.get("ai_calls", 0)), inline=True)
    if on and not src:
        embed.add_field(name="⚠️ Heads up", value="AI is enabled but you're not logged into Claude yet, so it can't "
                        "answer. Run `ant auth login` (or set `ANTHROPIC_AUTH_TOKEN`) and restart.", inline=False)
    embed.add_field(name="💡 Chef tool", value="Chefs can always use **🤖 AI Assist** on a claimed order or `/ai <question>`.",
                    inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@app_commands.command(name="ai", description="Ask the AI for help handling this ticket (chefs only)")
@app_commands.describe(question="What you need: a summary, a drafted reply, the next step…")
@app_commands.guild_only()
async def ai_cmd(interaction: discord.Interaction, question: app_commands.Range[str, 1, AI_MAX_INPUT]):
    await run_chef_ai(interaction, question.strip())


@app_commands.command(name="notify", description="DM the customer in this ticket that the owner needs them")
@app_commands.describe(message="Extra message to include in the DM (optional)")
@app_commands.guild_only()
async def notify_cmd(interaction: discord.Interaction, message: Optional[app_commands.Range[str, 1, 300]] = None):
    channel, actor = interaction.channel, interaction.user
    ticket = store.ticket(channel.id) if channel else None
    if ticket is None:
        return await send_error(interaction, "Use `/notify` inside a ticket.")
    wait = notify_cooldowns.get(channel.id, 0) + NOTIFY_COOLDOWN_SECONDS - time.monotonic()
    if wait > 0:
        return await send_error(interaction, f"The customer was just notified — try again in **{wait:.0f}s**.")
    notify_cooldowns[channel.id] = time.monotonic()
    await ack(interaction)

    guild = interaction.guild
    jump = channel.jump_url
    who = "👑 **The owner**" if is_owner(actor) else f"🧑‍🍳 **{actor.display_name}** (chef)"
    dm = discord.Embed(
        title="🔔 You're needed in your ticket!", url=jump, color=COLOR_GOLD,
        description=(f"{who} from **{guild.name}** needs you in your ticket.\n\n"
                     f"👉 **[Click here to open your ticket]({jump})**"),
    )
    dm.add_field(name="🎫 Ticket", value=f"#{ticket['number']:04d} • {channel.mention}", inline=True)
    dm.add_field(name="🏠 Server", value=guild.name, inline=True)
    if ticket["kind"] != "support":
        dm.add_field(name="📌 Order status", value=order_status(ticket), inline=False)
    if message:
        dm.add_field(name="💬 Message", value=f">>> {message}", inline=False)
    if guild.icon:
        dm.set_thumbnail(url=guild.icon.url)
    stamp(dm, f"Order #{ticket['number']:04d}")

    delivered = False
    try:
        customer = guild.get_member(ticket["owner_id"]) or await interaction.client.fetch_user(ticket["owner_id"])
        await customer.send(embed=dm, view=link_view(jump, "Open Ticket", "🎫"))
        delivered = True
    except discord.HTTPException as exc:
        log.info("Notify DM failed for %s: %s", ticket["owner_id"], exc)

    note_embed = discord.Embed(
        title="🔔 Customer Notified",
        description=(f"{actor.mention} needs {mention(ticket['owner_id'])} here!\n\n"
                     + ("📬 **DM sent** with a link to this ticket." if delivered else
                        "⚠️ **Their DMs are closed** — pinged them here instead.")),
        color=COLOR_GOLD if delivered else COLOR_ORANGE,
    )
    if message:
        note_embed.add_field(name="💬 Message", value=f">>> {message}", inline=False)
    await channel.send(content=mention(ticket["owner_id"]), embed=stamp(note_embed, f"Order #{ticket['number']:04d}"),
                       allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))
    await finish(interaction, "📬 DM sent to the customer." if delivered else
                 "⚠️ Their DMs are closed — I pinged them in the ticket instead.")


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
        "`/listadd` · `/listremove` — edit the restaurant list\n"
        "`/set vouch` — vouch channel • `/buyer` — buyer role • `/givestars` — add/remove stars\n"
        "`/aisupport on|off` — AI help for customers in support tickets"), inline=False)
    embed.add_field(name="⭐ Vouches & Rewards (everyone)", value=(
        "After a completed order the customer gets the **buyer role** and a **Leave a Vouch** button "
        "(stars + screenshot → posted in the vouch channel). Each vouch = **+1 ⭐**.\n"
        f"`/stars` — check your stars • `/free order` — use **{FREE_ORDER_STARS} ⭐** in your ticket for a FREE order"),
        inline=False)
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
        "`/notify` — DM the customer that you need them (with a link to the ticket)\n"
        "`/ai <question>` — AI assist for handling this ticket (chefs)\n"
        "`/queue` — every order waiting / in progress\n"
        "`/set payment` — save your payment info (e.g. Venmo → 973 202 0355) • `/mypay` · `/unset`\n"
        "`/pay` or type `.venmo` `.cashapp` `.pay` … in a ticket — send YOUR saved payment info\n"
        "`/add` · `/remove` · `/rename` — manage the ticket"), inline=False)
    embed.add_field(name="🔘 Chef buttons (after claiming)", value=(
        "💰 **Payment Received** → 🛒 **Order Placed** → 🚗 **On The Way** → ✅ **Mark Complete**\n"
        "📍 **Full Address** — exact street, city, state & ZIP (copyable) • 💸 **Payment Info** — your saved pay info\n"
        "Each one pings the customer and updates the order timeline. ↩️ **Unclaim** gives it back."), inline=False)
    embed.add_field(name="⭐ After completion", value="The customer rates the chef 1–5 stars (shown in `/stats` and "
                                                       "`/leaderboard`) and gets a receipt in DMs.", inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


ALL_COMMANDS = [ticket_cmd, setchef_cmd, setlogs_cmd, panel_cmd, clockin_cmd, clockout_cmd, staffonline_cmd,
                stats_cmd, leaderboard_cmd, claim_cmd, unclaim_cmd, complete_cmd, close_cmd, add_cmd,
                remove_cmd, rename_cmd, orderinfo_cmd, blacklist_cmd, unblacklist_cmd, list_cmd, listadd_cmd,
                listremove_cmd, queue_cmd, set_group, unset_cmd, mypay_cmd, pay_cmd, buyer_cmd, stars_cmd,
                givestars_cmd, free_group, notify_cmd, aisupport_cmd, ai_cmd, help_cmd]


# ==========================================================================
# Client
# ==========================================================================
PERSISTENT_VIEWS = (PanelView, ListView, CloseConfirmView, TicketControlView, AddressStepView, ShotStepView, PayStepView,
                    AddressConfirmView, ClaimView, ClaimedView, RateView, VouchView, AISupportView)


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
        src = credential_source()
        log.info("AI support: %s", f"logged in via {src}, model {AI_MODEL_DEFAULT} (owner enables with /aisupport on)"
                 if src else "not logged in (run `ant auth login` or set ANTHROPIC_AUTH_TOKEN to enable)")
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

    async def on_error(self, event_method: str, *args, **kwargs) -> None:
        log.exception("Error in %s - the bot keeps running", event_method)

    async def handle_dot_command(self, message: discord.Message) -> bool:
        """.venmo / .cashapp / .pay ... -> post the author's OWN saved payment info (chefs + owner only)."""
        parts = message.content.strip()[1:].split()
        word = parts[0].lower() if parts else ""
        if word == "pay":
            wanted = None
        elif word in ALIAS_TO_METHOD:
            wanted = ALIAS_TO_METHOD[word]
        else:
            return False
        if not isinstance(message.author, discord.Member) or not can_use_commands(message.author,
                                                                                  store.guild(message.guild.id)):
            return False
        error = await post_pay_info(message.channel, message.author, wanted)
        if error:
            await message.channel.send(embed=note(f"⚠️ {message.author.mention} {error}", COLOR_RED), delete_after=15)
        try:
            await message.delete()
        except discord.HTTPException:
            pass
        return True

    async def on_message(self, message: discord.Message):
        if message.author.bot or message.guild is None:
            return
        if message.content.startswith("."):
            try:
                if await self.handle_dot_command(message):
                    return
            except discord.HTTPException as exc:
                log.warning("Dot-command failed in %s: %s", message.channel.id, exc)
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
LIMITED_INTENT_FLAGS = (1 << 13) | (1 << 15) | (1 << 19)   # presence / members / message-content (limited)


def discord_api(token: str, method: str, path: str, body: Optional[dict] = None) -> dict:
    req = urllib.request.Request(
        f"https://discord.com/api/v10{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bot {token}", "Content-Type": "application/json",
                 "User-Agent": "DiscordBot (https://github.com/Rapptz/discord.py, 2)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def preflight(token: str) -> Optional[dict]:
    """Check the app before connecting and switch on the Message Content intent if it's off."""
    try:
        data = discord_api(token, "GET", "/applications/@me")
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return {"invalid": True}
        log.warning("Pre-check failed (HTTP %s) - continuing", exc.code)
        return None
    except Exception as exc:  # network / SSL problems: just skip the pre-check
        log.warning("Pre-check skipped (%s) - continuing", exc)
        return None
    flags = int(data.get("flags", 0))
    message_content = bool(flags & INTENT_MESSAGE_CONTENT)
    if not message_content:
        # Bots in under 100 servers may enable the limited intent themselves (same as the portal toggle).
        try:
            result = discord_api(token, "PATCH", "/applications/@me",
                                 {"flags": (flags & LIMITED_INTENT_FLAGS) | (1 << 19)})
            message_content = bool(int(result.get("flags", 0)) & INTENT_MESSAGE_CONTENT)
            if message_content:
                log.info("Turned ON the Message Content intent (needed for typed answers and .venmo commands).")
        except Exception as exc:
            log.warning("Couldn't switch on the Message Content intent automatically (%s).", exc)
    return {
        "invalid": False,
        "name": data.get("name"),
        "message_content": message_content,
        "guilds": data.get("approximate_guild_count", data.get("bot_approximate_guild_count")),
    }


def pause_before_exit() -> None:
    if os.name == "nt":
        try:
            input("\nPress Enter to close this window...")
        except (EOFError, KeyboardInterrupt):
            pass


def disable_quick_edit() -> None:
    """Windows: clicking inside the console normally FREEZES the program until a key is pressed
    (the bot goes offline 'for a bit'). Turn that selection mode off."""
    if os.name != "nt":
        return
    try:
        import ctypes
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-10)          # STD_INPUT_HANDLE
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, (mode.value & ~0x0040) | 0x0080)   # -QUICK_EDIT, +EXTENDED_FLAGS
    except Exception:
        pass


_instance_socket: Optional[socket.socket] = None


def claim_single_instance() -> bool:
    """Two copies of the bot answer every button twice and throw errors. Allow only one."""
    global _instance_socket
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", SINGLE_INSTANCE_PORT))
        sock.listen(1)
    except OSError:
        sock.close()
        return False
    _instance_socket = sock
    return True


def setup_logs() -> None:
    discord.utils.setup_logging(level=logging.INFO)
    try:
        handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=3, encoding="utf-8")
        handler.setFormatter(logging.Formatter("[{asctime}] [{levelname:<8}] {name}: {message}",
                                               "%Y-%m-%d %H:%M:%S", style="{"))
        logging.getLogger().addHandler(handler)
    except OSError:
        pass
    logging.getLogger("discord.gateway").setLevel(logging.WARNING)   # hide routine reconnect chatter


def main() -> None:
    global TYPED_INPUT
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass
    setup_logs()
    disable_quick_edit()
    discord.VoiceClient.warn_nacl = False     # no voice features used - hide noisy warnings
    discord.VoiceClient.warn_dave = False

    if discord.version_info < (2, 7, 0):
        log.error("discord.py %s is too old. Run:  pip install -U \"discord.py>=2.7\"", discord.__version__)
        return pause_before_exit()
    if not TOKEN or TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE":
        log.error("No token. Paste your bot token into TOKEN at the top of main.py.")
        return pause_before_exit()
    if not claim_single_instance():
        log.error("The bot is ALREADY RUNNING in another window. Close that one first (running two copies causes errors).")
        return pause_before_exit()

    info = preflight(TOKEN)
    if info and info["invalid"]:
        log.error("Discord rejected the token. Developer Portal -> Bot -> Reset Token, then paste the new one.")
        return pause_before_exit()
    use_mc = True
    if info is not None:
        use_mc = info["message_content"]
        log.info("App '%s' found. Message Content Intent: %s. Servers: %s", info["name"],
                 "ENABLED" if use_mc else "disabled", info["guilds"])
        if not use_mc:
            log.warning("Message Content Intent is OFF -> pop-up forms only, and .venmo commands won't work. "
                        "Turn it on: Developer Portal -> Bot -> MESSAGE CONTENT INTENT -> Save.")
    log.info("Logs are also saved to %s", LOG_FILE.name)

    failures = 0
    while True:   # supervisor: if the bot ever crashes, it restarts itself
        TYPED_INPUT = use_mc
        bot = FoodBot(message_content=use_mc)
        started = time.monotonic()
        try:
            bot.run(TOKEN, log_handler=None)
            log.info("Bot stopped.")
            break                                   # Ctrl+C / normal shutdown
        except discord.PrivilegedIntentsRequired:
            if not use_mc:
                log.error("Discord refused the connection (intents). Check the Developer Portal settings.")
                break
            log.warning("Message Content Intent isn't enabled - restarting in forms-only mode.")
            use_mc = False
            continue
        except discord.LoginFailure:
            log.error("Discord rejected the token. Developer Portal -> Bot -> Reset Token, then paste the new one.")
            break
        except KeyboardInterrupt:
            break
        except Exception:
            log.error("Bot crashed - it will restart by itself:\n%s", traceback.format_exc())
        failures = 0 if time.monotonic() - started > 300 else failures + 1
        delay = min(60, 5 * 2 ** min(failures, 4))
        log.warning("Restarting in %d seconds... (close the window or press Ctrl+C to stop)", delay)
        try:
            time.sleep(delay)
        except KeyboardInterrupt:
            break
    pause_before_exit()


if __name__ == "__main__":
    main()
