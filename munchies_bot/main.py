"""
Munchies Order Desk - Discord ticket bot (discord.py 2.4+)

Run:
    pip install -U "discord.py>=2.4"
    python main.py

Token: set DISCORD_TOKEN env var, or paste it into TOKEN below.
Developer Portal -> Bot -> enable "MESSAGE CONTENT INTENT" (required).
"""

from __future__ import annotations

import asyncio
import io
import json
import os
import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import discord
from discord import app_commands

# --------------------------------------------------------------------------
# Config
# --------------------------------------------------------------------------
TOKEN = os.getenv("DISCORD_TOKEN", "").strip() or "PASTE_YOUR_BOT_TOKEN_HERE"

BRAND = "Munchies"
CURRENCY = "$"
PRICE_DIVISOR = Decimal(3)          # customer pays 1/3 of the order total
MAX_ORDER_TOTAL = Decimal("100000")
CLOSE_DELAY_SECONDS = 5
DATA_FILE = Path(__file__).with_name("munchies_data.json")

COLOR_GREEN = 0x57F287
COLOR_BLURPLE = 0x5865F2
COLOR_GOLD = 0xF1C40F
COLOR_ORANGE = 0xF39C12
COLOR_RED = 0xED4245
COLOR_BLUE = 0x3498DB
COLOR_DARK = 0x2B2D31

KIND_INFO = {
    "order":   {"prefix": "order",   "title": "🧾 Order Ticket",   "color": COLOR_BLURPLE},
    "vip":     {"prefix": "vip",     "title": "⭐ VIP Order Ticket", "color": COLOR_GOLD},
    "support": {"prefix": "support", "title": "💬 Support Ticket", "color": COLOR_DARK},
}


# --------------------------------------------------------------------------
# Persistent storage (JSON file next to main.py)
# --------------------------------------------------------------------------
class Store:
    GUILD_DEFAULTS = {
        "staff_role": None,
        "chef_role": None,
        "vip_role": None,
        "category": None,
        "log_channel": None,
        "panels": [],        # [[channel_id, message_id], ...]
        "clocked_in": [],    # [user_id, ...]
        "counter": 0,
    }

    def __init__(self, path: Path):
        self.path = path
        self.data: dict = {"guilds": {}, "tickets": {}}
        self.load()

    def load(self) -> None:
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text("utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                backup = self.path.with_suffix(".corrupt.json")
                print(f"[store] could not read {self.path.name}: {exc} -> moved to {backup.name}")
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
                g[key] = list(value) if isinstance(value, list) else value
        return g

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


def lock_for(channel_id: int) -> asyncio.Lock:
    return channel_locks.setdefault(channel_id, asyncio.Lock())


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
class TicketError(Exception):
    """Validation failure shown to the user as an ephemeral error."""


def mention(user_id: Optional[int]) -> str:
    return f"<@{user_id}>" if user_id else "—"


def role_mention(role_id: Optional[int]) -> str:
    return f"<@&{role_id}>" if role_id else "*not set*"


def money(value: Decimal) -> str:
    return f"{CURRENCY}{value:,.2f}"


def stamp(embed: discord.Embed, extra: Optional[str] = None) -> discord.Embed:
    text = f"{BRAND} • Order Desk"
    if extra:
        text += f" • {extra}"
    embed.set_footer(text=text)
    embed.timestamp = discord.utils.utcnow()
    return embed


def has_role(member: discord.Member, role_id: Optional[int]) -> bool:
    return role_id is not None and any(r.id == role_id for r in member.roles)


def is_admin(member: discord.Member) -> bool:
    return member.guild_permissions.administrator


def is_staff(member: discord.Member, g: dict) -> bool:
    return is_admin(member) or has_role(member, g["staff_role"]) or has_role(member, g["chef_role"])


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9-]", "", name.lower().replace(" ", "-"))
    return slug[:20] or "user"


MONEY_RE = re.compile(r"(\$)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?")


def parse_total(text: str) -> tuple[Optional[Decimal], bool]:
    """Return (amount, ambiguous). Prefers a $-prefixed number; otherwise needs exactly one number."""
    matches = list(MONEY_RE.finditer(text))
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


def image_attachments(message: discord.Message) -> list[discord.Attachment]:
    exts = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic")
    return [
        a for a in message.attachments
        if (a.content_type or "").startswith("image/") or a.filename.lower().endswith(exts)
    ]


async def send_error(interaction: discord.Interaction, text: str) -> None:
    embed = discord.Embed(title="⚠️ Can't do that", description=text, color=COLOR_RED)
    stamp(embed)
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
    """Close out a slash-command 'thinking' state. Buttons need nothing."""
    if interaction.type == discord.InteractionType.application_command:
        try:
            await interaction.followup.send(text, ephemeral=True)
        except discord.HTTPException:
            pass


def get_ticket_or_fail(channel: discord.abc.GuildChannel) -> dict:
    ticket = store.ticket(channel.id)
    if ticket is None:
        raise TicketError("This command only works inside a ticket channel.")
    return ticket


# --------------------------------------------------------------------------
# Embeds
# --------------------------------------------------------------------------
def panel_embed(g: dict) -> discord.Embed:
    online = g["clocked_in"]
    staff_text = "\n".join(mention(uid) for uid in online) if online else "*No staff clocked in right now*"
    embed = discord.Embed(
        title=f"🍽️ {BRAND} Order Desk",
        description="Click **Create Order** below to open a private order ticket with staff.",
        color=COLOR_GREEN,
    )
    embed.add_field(name="Status", value="🟢 Open — taking orders", inline=False)
    embed.add_field(name="Staff Online", value=staff_text[:1024], inline=False)
    return stamp(embed)


def welcome_embed(ticket: dict, g: dict) -> discord.Embed:
    info = KIND_INFO[ticket["kind"]]
    embed = discord.Embed(
        title=f"{info['title']} #{ticket['number']:04d}",
        color=info["color"],
    )
    if ticket["kind"] == "support":
        embed.description = (
            f"Welcome {mention(ticket['owner_id'])}! 👋\n\n"
            "**Describe your issue below** and a staff member will help you as soon as possible.\n"
            "Please include any order details, screenshots, or links that help explain the problem."
        )
    else:
        vip = "\n⭐ **VIP priority** — your order goes to the front of the line.\n" if ticket["kind"] == "vip" else ""
        embed.description = (
            f"Welcome {mention(ticket['owner_id'])}! 👋\n{vip}\n"
            "Answer the questions below and your order will be sent to the kitchen."
        )
        embed.add_field(
            name="📋 How it works",
            value=(
                "**1.** Send the restaurant + your full address\n"
                "**2.** Confirm the address is correct\n"
                "**3.** Send the order screenshot + total (with tax & delivery)\n"
                f"**4.** Pay **1/{PRICE_DIVISOR}** of the total & tell us your payment method\n"
                "**5.** A chef claims your order and gets it done ✅"
            ),
            inline=False,
        )
    online = g["clocked_in"]
    embed.add_field(
        name="🟢 Staff Online",
        value=(" ".join(mention(u) for u in online) if online else "*No staff clocked in — someone will be with you soon*")[:1024],
        inline=False,
    )
    embed.add_field(name="🔒 Done?", value="Press **Close Ticket** below or use `/close`.", inline=False)
    return stamp(embed, f"Ticket #{ticket['number']:04d}")


def step_address_embed(retry: bool = False) -> discord.Embed:
    if retry:
        embed = discord.Embed(
            title="✏️ Retype Your Address",
            description=(
                "No problem! **Retype the restaurant and your full address** and send it to me "
                "as **one message** below."
            ),
            color=COLOR_ORANGE,
        )
    else:
        embed = discord.Embed(
            title="🏪 Step 1 of 4 — Restaurant & Address",
            description=(
                "**What's the restaurant and your full address?**\n"
                "Type both in **one message** below."
            ),
            color=COLOR_BLURPLE,
        )
    embed.add_field(
        name="📝 Example",
        value="```\nChipotle\n123 Main St, Apt 4B, Springfield, IL 62704\n```",
        inline=False,
    )
    embed.add_field(
        name="💡 Tip",
        value="Include apartment / unit number, city, state and ZIP so nothing goes wrong.",
        inline=False,
    )
    return stamp(embed, "Step 1/4")


def step_confirm_embed(address: str) -> discord.Embed:
    embed = discord.Embed(
        title="📍 Step 2 of 4 — Are you correct?",
        description="Double-check the restaurant and address below, then press **Yes** or **No**.",
        color=COLOR_GOLD,
    )
    embed.add_field(name="🏪 Restaurant & Address", value=f">>> {address}"[:1024], inline=False)
    embed.add_field(
        name="❓ What next",
        value="✅ **Yes** — continue to the order screenshot\n❌ **No** — retype your address",
        inline=False,
    )
    return stamp(embed, "Step 2/4")


def step_screenshot_embed() -> discord.Embed:
    embed = discord.Embed(
        title="🧾 Step 3 of 4 — Order Screenshot & Total",
        description=(
            "Send me the **screenshot of the order** and the **order total with tax and delivery**.\n\n"
            "Attach the screenshot and type the total in the same message — or send them one after the other."
        ),
        color=COLOR_BLURPLE,
    )
    embed.add_field(name="📸 Screenshot", value="Upload an image of your cart / checkout page.", inline=True)
    embed.add_field(name="💲 Total", value="Example: `$30.00`", inline=True)
    return stamp(embed, "Step 3/4")


def step_payment_embed(total: Decimal, due: Decimal) -> discord.Embed:
    embed = discord.Embed(
        title="💵 Step 4 of 4 — Payment",
        description=(
            f"Your order is **{money(due)}**\n\n"
            "**What payment are you using?** Type it below "
            "(e.g. Cash App, PayPal, Venmo, Zelle, Apple Pay, Crypto)."
        ),
        color=COLOR_GREEN,
    )
    embed.add_field(name="🧾 Order Total", value=money(total), inline=True)
    embed.add_field(name=f"✂️ You Pay (1/{PRICE_DIVISOR})", value=f"**{money(due)}**", inline=True)
    embed.add_field(name="💰 You Save", value=money(total - due), inline=True)
    return stamp(embed, "Step 4/4")


def summary_embed(ticket: dict, status: str, with_image: Optional[str]) -> discord.Embed:
    vip = ticket["kind"] == "vip"
    embed = discord.Embed(
        title=("⭐ VIP " if vip else "") + "🧑‍🍳 New Order — Ready for a Chef",
        description=f"Order from {mention(ticket['owner_id'])} has been submitted to the kitchen.",
        color=COLOR_GOLD if vip else COLOR_ORANGE,
    )
    embed.add_field(name="👤 Customer", value=mention(ticket["owner_id"]), inline=True)
    embed.add_field(name="🎫 Ticket", value=f"#{ticket['number']:04d}", inline=True)
    embed.add_field(name="⭐ Priority", value="VIP" if vip else "Standard", inline=True)
    embed.add_field(name="🏪 Restaurant & Address", value=f">>> {ticket['address']}"[:1024], inline=False)
    embed.add_field(name="🧾 Order Total", value=money(Decimal(ticket["total"])), inline=True)
    embed.add_field(name="💵 Customer Pays", value=f"**{money(Decimal(ticket['due']))}**", inline=True)
    embed.add_field(name="💳 Payment", value=ticket["payment"][:1024], inline=True)
    embed.add_field(name="📌 Status", value=status, inline=False)
    if with_image:
        embed.set_image(url=f"attachment://{with_image}")
    return stamp(embed, f"Ticket #{ticket['number']:04d}")


def status_waiting() -> str:
    return "🟠 Waiting for a chef to **claim** this order"


def status_claimed(user_id: int) -> str:
    return f"🔵 Claimed by {mention(user_id)}"


def status_done(user_id: int) -> str:
    return f"✅ Completed by {mention(user_id)}"


# --------------------------------------------------------------------------
# Views (all persistent: they keep working after a bot restart)
# --------------------------------------------------------------------------
class PanelView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Create Order", emoji="🧾", style=discord.ButtonStyle.primary,
                       custom_id="munchies:panel:order")
    async def create_order(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "order")

    @discord.ui.button(label="Support", emoji="💬", style=discord.ButtonStyle.secondary,
                       custom_id="munchies:panel:support")
    async def support(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "support")

    @discord.ui.button(label="VIP", emoji="⭐", style=discord.ButtonStyle.danger,
                       custom_id="munchies:panel:vip")
    async def vip(self, interaction: discord.Interaction, button: discord.ui.Button):
        await open_ticket(interaction, "vip")


class TicketControlView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)

    @discord.ui.button(label="Close Ticket", emoji="🔒", style=discord.ButtonStyle.danger,
                       custom_id="munchies:ticket:close")
    async def close(self, interaction: discord.Interaction, button: discord.ui.Button):
        try:
            ticket = get_ticket_or_fail(interaction.channel)
            check_can_close(interaction.user, ticket)
        except TicketError as exc:
            return await send_error(interaction, str(exc))
        embed = discord.Embed(
            title="🔒 Close this ticket?",
            description=(
                "The channel will be **deleted** and a transcript saved to the log channel.\n"
                "This can't be undone."
            ),
            color=COLOR_RED,
        )
        await interaction.response.send_message(embed=stamp(embed), view=CloseConfirmView(), ephemeral=True)


class CloseConfirmView(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=60)

    @discord.ui.button(label="Yes, close it", emoji="🔒", style=discord.ButtonStyle.danger)
    async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content="Closing…", embed=None, view=None)
        try:
            await close_ticket(interaction.channel, interaction.user, reason="Closed with button")
        except TicketError as exc:
            await send_error(interaction, str(exc))

    @discord.ui.button(label="Cancel", emoji="✖️", style=discord.ButtonStyle.secondary)
    async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
        await interaction.response.edit_message(content="Cancelled — ticket stays open.", embed=None, view=None)


class AddressConfirmView(discord.ui.View):
    def __init__(self, disabled: bool = False):
        super().__init__(timeout=None)
        if disabled:
            self.yes.disabled = True
            self.no.disabled = True

    @discord.ui.button(label="Yes, that's correct", emoji="✅", style=discord.ButtonStyle.success,
                       custom_id="munchies:order:addr_yes")
    async def yes(self, interaction: discord.Interaction, button: discord.ui.Button):
        await answer_address(interaction, correct=True)

    @discord.ui.button(label="No, retype it", emoji="❌", style=discord.ButtonStyle.danger,
                       custom_id="munchies:order:addr_no")
    async def no(self, interaction: discord.Interaction, button: discord.ui.Button):
        await answer_address(interaction, correct=False)


class ClaimView(discord.ui.View):
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
                       custom_id="munchies:order:claim")
    async def claim(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_claim(interaction)


class ClaimedView(discord.ui.View):
    def __init__(self, disabled: bool = False):
        super().__init__(timeout=None)
        if disabled:
            self.unclaim.disabled = True
            self.complete.disabled = True

    @discord.ui.button(label="Unclaim", emoji="↩️", style=discord.ButtonStyle.secondary,
                       custom_id="munchies:order:unclaim")
    async def unclaim(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_unclaim(interaction)

    @discord.ui.button(label="Mark Complete", emoji="✅", style=discord.ButtonStyle.success,
                       custom_id="munchies:order:complete")
    async def complete(self, interaction: discord.Interaction, button: discord.ui.Button):
        await do_complete(interaction)


# --------------------------------------------------------------------------
# Panel refresh
# --------------------------------------------------------------------------
async def refresh_panels(guild: discord.Guild) -> None:
    g = store.guild(guild.id)
    keep = []
    for channel_id, message_id in g["panels"]:
        channel = guild.get_channel(channel_id)
        if not isinstance(channel, discord.TextChannel):
            continue
        try:
            await channel.get_partial_message(message_id).edit(embed=panel_embed(g), view=PanelView())
            keep.append([channel_id, message_id])
        except discord.NotFound:
            continue
        except discord.HTTPException as exc:
            print(f"[panel] could not update {channel_id}/{message_id}: {exc}")
            keep.append([channel_id, message_id])
    if keep != g["panels"]:
        g["panels"] = keep
        store.save()


# --------------------------------------------------------------------------
# Ticket creation
# --------------------------------------------------------------------------
def staff_overwrite(can_send: bool) -> discord.PermissionOverwrite:
    return discord.PermissionOverwrite(
        view_channel=True, send_messages=can_send, attach_files=can_send,
        embed_links=can_send, read_message_history=True,
    )


async def open_ticket(interaction: discord.Interaction, kind: str) -> None:
    guild = interaction.guild
    member = interaction.user
    if guild is None or not isinstance(member, discord.Member):
        return await send_error(interaction, "Tickets can only be opened inside a server.")

    g = store.guild(guild.id)
    category = guild.get_channel(g["category"]) if g["category"] else None
    if not isinstance(category, discord.CategoryChannel) or not g["staff_role"]:
        return await send_error(interaction, "The ticket system isn't set up yet. An admin needs to run `/ticket`.")

    if kind == "vip" and g["vip_role"] and not has_role(member, g["vip_role"]) and not is_admin(member):
        return await send_error(
            interaction,
            f"⭐ VIP tickets are only for members with {role_mention(g['vip_role'])}.\n"
            "Use **Create Order** instead.",
        )

    for cid, t in store.tickets().items():
        if t["guild_id"] == guild.id and t["owner_id"] == member.id and t["kind"] == kind:
            if guild.get_channel(int(cid)):
                return await send_error(interaction, f"You already have an open {kind} ticket: <#{cid}>")

    await interaction.response.defer(ephemeral=True, thinking=True)

    g["counter"] += 1
    number = g["counter"]
    store.save()

    info = KIND_INFO[kind]
    overwrites: dict = {
        guild.default_role: discord.PermissionOverwrite(view_channel=False),
        member: discord.PermissionOverwrite(
            view_channel=True, send_messages=True, attach_files=True,
            embed_links=True, read_message_history=True,
        ),
        guild.me: discord.PermissionOverwrite(
            view_channel=True, send_messages=True, attach_files=True,
            embed_links=True, read_message_history=True,
        ),
    }
    for role_id in (g["staff_role"], g["chef_role"]):
        role = guild.get_role(role_id) if role_id else None
        if role:
            overwrites[role] = staff_overwrite(True)

    try:
        channel = await guild.create_text_channel(
            name=f"{info['prefix']}-{number:04d}-{slugify(member.name)}",
            category=category,
            overwrites=overwrites,
            topic=f"{info['title']} #{number:04d} • opened by {member} ({member.id})",
            reason=f"{BRAND} ticket opened by {member}",
        )
    except discord.Forbidden:
        return await interaction.followup.send(
            "❌ I don't have permission to create channels in that category. "
            "Give my role **Manage Channels** + **Manage Roles** (or Administrator).",
            ephemeral=True,
        )
    except discord.HTTPException as exc:
        return await interaction.followup.send(f"❌ Discord error while creating the ticket: {exc}", ephemeral=True)

    ticket = {
        "guild_id": guild.id,
        "owner_id": member.id,
        "kind": kind,
        "number": number,
        "stage": "support" if kind == "support" else "address",
        "address": None,
        "total": None,
        "due": None,
        "screenshot_msg_id": None,
        "payment": None,
        "claimed_by": None,
        "confirm_msg_id": None,
        "summary_msg_id": None,
        "claim_msg_id": None,
        "completed": False,
        "created_at": discord.utils.utcnow().isoformat(),
    }
    store.set_ticket(channel.id, ticket)

    await channel.send(
        content=member.mention,
        embed=welcome_embed(ticket, g),
        view=TicketControlView(),
        allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False),
    )
    if kind != "support":
        await channel.send(embed=step_address_embed())

    done = discord.Embed(
        title="✅ Ticket Created",
        description=f"Your {info['title'].split(' ', 1)[1].lower()} is ready: {channel.mention}",
        color=COLOR_GREEN,
    )
    await interaction.followup.send(embed=stamp(done), ephemeral=True)


# --------------------------------------------------------------------------
# Order flow (driven by the ticket owner's messages)
# --------------------------------------------------------------------------
async def handle_order_message(message: discord.Message, ticket: dict) -> None:
    channel = message.channel
    stage = ticket["stage"]
    text = message.content.strip()

    if stage == "address":
        if len(text) < 5:
            await channel.send(embed=stamp(discord.Embed(
                description="✍️ Please **type** the restaurant and your full address in one message.",
                color=COLOR_ORANGE)))
            return
        if len(text) > 1000:
            await channel.send(embed=stamp(discord.Embed(
                description="✂️ That's too long — keep it under 1000 characters.", color=COLOR_ORANGE)))
            return
        ticket["address"] = text
        ticket["stage"] = "confirm"
        msg = await channel.send(embed=step_confirm_embed(text), view=AddressConfirmView())
        ticket["confirm_msg_id"] = msg.id
        store.set_ticket(channel.id, ticket)

    elif stage == "screenshot":
        images = image_attachments(message)
        if images:
            ticket["screenshot_msg_id"] = message.id
        amount, ambiguous = parse_total(text) if text else (None, False)
        if amount is not None:
            ticket["total"] = str(amount)
        store.set_ticket(channel.id, ticket)

        have_shot = ticket["screenshot_msg_id"] is not None
        have_total = ticket["total"] is not None

        if have_shot and have_total:
            total = Decimal(ticket["total"])
            due = customer_share(total)
            ticket["due"] = str(due)
            ticket["stage"] = "payment"
            store.set_ticket(channel.id, ticket)
            await channel.send(embed=step_payment_embed(total, due))
            return

        if not images and amount is None:
            if ambiguous:
                hint = "I found more than one number. Send **just the total**, like `$30.00`."
            elif text:
                hint = "I couldn't read an order total from that. Type it like `$30.00`."
            else:
                hint = "Please attach your **order screenshot** and type the **total**."
            await channel.send(embed=stamp(discord.Embed(description=f"⚠️ {hint}", color=COLOR_ORANGE), "Step 3/4"))
            return

        if have_shot and not have_total:
            desc = "📸 Got your screenshot! Now **type the order total** with tax & delivery (e.g. `$30.00`)."
        else:
            desc = f"💲 Got your total (**{money(Decimal(ticket['total']))}**)! Now **send the screenshot** of the order."
        await channel.send(embed=stamp(discord.Embed(description=desc, color=COLOR_BLURPLE), "Step 3/4"))

    elif stage == "payment":
        if not text:
            await channel.send(embed=stamp(discord.Embed(
                description="💳 Please **type** your payment method (e.g. Cash App).", color=COLOR_ORANGE)))
            return
        ticket["payment"] = text[:200]
        ticket["stage"] = "submitted"
        store.set_ticket(channel.id, ticket)
        await send_order_summary(channel, ticket)


async def send_order_summary(channel: discord.TextChannel, ticket: dict) -> None:
    g = store.guild(channel.guild.id)
    ping_role = g["chef_role"] or g["staff_role"]
    content = f"{role_mention(ping_role)} 🔔 **New order ready to be claimed!**" if ping_role else "🔔 **New order ready to be claimed!**"
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
        print(f"[summary] could not fetch screenshot in {channel.id}: {exc}")

    embed = summary_embed(ticket, status_waiting(), file.filename if file else None)
    msg = None
    if file:
        try:
            msg = await channel.send(content=content, embed=embed, file=file, view=ClaimView(), allowed_mentions=allowed)
        except discord.HTTPException as exc:
            print(f"[summary] re-upload failed ({exc}); sending link instead")
    if msg is None:
        embed = summary_embed(ticket, status_waiting(), None)
        embed.add_field(name="📸 Screenshot",
                        value=f"[Jump to screenshot]({jump})" if jump else "*Screenshot unavailable*", inline=False)
        msg = await channel.send(content=content, embed=embed, view=ClaimView(), allowed_mentions=allowed)

    ticket["summary_msg_id"] = msg.id
    store.set_ticket(channel.id, ticket)


async def answer_address(interaction: discord.Interaction, correct: bool) -> None:
    channel = interaction.channel
    async with lock_for(channel.id):
        ticket = store.ticket(channel.id)
        if ticket is None:
            return await send_error(interaction, "This ticket no longer exists.")
        if interaction.user.id != ticket["owner_id"] and not is_admin(interaction.user):
            return await send_error(interaction, "Only the person who opened this ticket can answer this.")
        if ticket["stage"] != "confirm" or interaction.message.id != ticket["confirm_msg_id"]:
            return await send_error(interaction, "This question was already answered.")

        verdict = "✅ Confirmed" if correct else "❌ Rejected — retyping"
        old = interaction.message.embeds[0] if interaction.message.embeds else step_confirm_embed(ticket["address"])
        old.color = COLOR_GREEN if correct else COLOR_RED
        old.set_field_at(len(old.fields) - 1, name="📌 Answer", value=verdict, inline=False)
        await interaction.response.edit_message(embed=old, view=AddressConfirmView(disabled=True))

        if correct:
            ticket["stage"] = "screenshot"
            ticket["screenshot_msg_id"] = None
            ticket["total"] = None
            store.set_ticket(channel.id, ticket)
            await channel.send(embed=step_screenshot_embed())
        else:
            ticket["stage"] = "address"
            ticket["address"] = None
            ticket["confirm_msg_id"] = None
            store.set_ticket(channel.id, ticket)
            await channel.send(embed=step_address_embed(retry=True))


# --------------------------------------------------------------------------
# Claim / Unclaim / Complete / Close
# --------------------------------------------------------------------------
async def update_summary(channel: discord.TextChannel, ticket: dict, status: str, view: discord.ui.View) -> None:
    if not ticket.get("summary_msg_id"):
        return
    try:
        msg = await channel.fetch_message(ticket["summary_msg_id"])
        if not msg.embeds:
            return
        embed = msg.embeds[0]
        for i, field in enumerate(embed.fields):
            if field.name == "📌 Status":
                embed.set_field_at(i, name="📌 Status", value=status, inline=False)
                break
        await msg.edit(embed=embed, view=view)
    except discord.HTTPException as exc:
        print(f"[summary] update failed in {channel.id}: {exc}")


async def disable_claim_message(channel: discord.TextChannel, ticket: dict) -> None:
    if not ticket.get("claim_msg_id"):
        return
    try:
        await channel.get_partial_message(ticket["claim_msg_id"]).edit(view=ClaimedView(disabled=True))
    except discord.HTTPException:
        pass
    ticket["claim_msg_id"] = None


async def do_claim(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            g = store.guild(channel.guild.id)
            if not is_staff(member, g):
                raise TicketError(f"Only {role_mention(g['chef_role'] or g['staff_role'])} or admins can claim orders.")
            if ticket["completed"]:
                raise TicketError("This order is already completed.")
            if ticket["claimed_by"]:
                raise TicketError(f"Already claimed by {mention(ticket['claimed_by'])}.")
            if ticket["kind"] != "support" and ticket["stage"] != "submitted":
                raise TicketError("The customer hasn't finished submitting this order yet.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        await ack(interaction)

        # Lock the channel: only owner, claimer and admins can type.
        for role_id in (g["staff_role"], g["chef_role"]):
            role = channel.guild.get_role(role_id) if role_id else None
            if role:
                await channel.set_permissions(role, overwrite=staff_overwrite(False), reason=f"Claimed by {member}")
        if member.id != ticket["owner_id"]:
            await channel.set_permissions(
                member,
                overwrite=discord.PermissionOverwrite(
                    view_channel=True, send_messages=True, attach_files=True,
                    embed_links=True, read_message_history=True),
                reason=f"Claimed by {member}",
            )

        ticket["claimed_by"] = member.id
        await update_summary(channel, ticket, status_claimed(member.id), ClaimView(claimed=True))

        embed = discord.Embed(
            title="🙋 Order Claimed",
            description=(
                f"{member.mention} has claimed this order and is working on it now! 🧑‍🍳\n\n"
                f"🔐 Only {mention(ticket['owner_id'])}, {member.mention} and **administrators** can type here."
            ),
            color=COLOR_BLUE,
        )
        embed.add_field(name="👤 Customer", value=mention(ticket["owner_id"]), inline=True)
        embed.add_field(name="🧑‍🍳 Chef", value=member.mention, inline=True)
        if ticket.get("due"):
            embed.add_field(name="💵 Amount Due", value=money(Decimal(ticket["due"])), inline=True)
        embed.add_field(
            name="🛠️ Controls",
            value="**↩️ Unclaim** — give the order back\n**✅ Mark Complete** — finish the order (or `/complete`)",
            inline=False,
        )
        msg = await channel.send(embed=stamp(embed, f"Ticket #{ticket['number']:04d}"), view=ClaimedView())
        ticket["claim_msg_id"] = msg.id
        store.set_ticket(channel.id, ticket)
        await finish(interaction, "✅ You claimed this order.")


async def do_unclaim(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            g = store.guild(channel.guild.id)
            if not ticket["claimed_by"]:
                raise TicketError("This order isn't claimed.")
            if ticket["completed"]:
                raise TicketError("This order is already completed.")
            if member.id != ticket["claimed_by"] and not is_admin(member):
                raise TicketError(f"Only {mention(ticket['claimed_by'])} or an administrator can unclaim this.")
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
                await bot.http.delete_channel_permissions(channel.id, previous, reason=f"Unclaimed by {member}")
            except discord.HTTPException:
                pass

        ticket["claimed_by"] = None
        await disable_claim_message(channel, ticket)
        await update_summary(channel, ticket, status_waiting(), ClaimView())
        store.set_ticket(channel.id, ticket)

        ping_role = g["chef_role"] or g["staff_role"]
        embed = discord.Embed(
            title="↩️ Order Unclaimed",
            description=(
                f"{member.mention} unclaimed this order (was {mention(previous)}).\n\n"
                "🔓 Staff can type here again — the order is **back up for grabs**. Press **Claim Order** above."
            ),
            color=COLOR_ORANGE,
        )
        await channel.send(
            content=role_mention(ping_role) if ping_role else None,
            embed=stamp(embed, f"Ticket #{ticket['number']:04d}"),
            allowed_mentions=discord.AllowedMentions(roles=True, users=False, everyone=False),
        )
        await finish(interaction, "✅ Order unclaimed.")


async def do_complete(interaction: discord.Interaction) -> None:
    channel, member = interaction.channel, interaction.user
    async with lock_for(channel.id):
        try:
            ticket = get_ticket_or_fail(channel)
            if ticket["completed"]:
                raise TicketError("This order is already marked complete.")
            if not ticket["claimed_by"]:
                raise TicketError("Claim the order first (press **Claim Order** or use `/claim`).")
            if member.id != ticket["claimed_by"] and not is_admin(member):
                raise TicketError(f"Only {mention(ticket['claimed_by'])} or an administrator can complete this.")
        except TicketError as exc:
            return await send_error(interaction, str(exc))

        await ack(interaction)
        chef = ticket["claimed_by"]
        ticket["completed"] = True
        ticket["stage"] = "completed"
        await disable_claim_message(channel, ticket)
        await update_summary(channel, ticket, status_done(chef), ClaimView(done=True))
        store.set_ticket(channel.id, ticket)

        embed = discord.Embed(
            title="✅ Order Complete",
            description=(
                f"This order from {mention(ticket['owner_id'])} has been done by {mention(chef)}. 🎉\n\n"
                f"Thanks for ordering with **{BRAND}**! Press **Close Ticket** when you're finished."
            ),
            color=COLOR_GREEN,
        )
        embed.add_field(name="👤 Customer", value=mention(ticket["owner_id"]), inline=True)
        embed.add_field(name="🧑‍🍳 Done by", value=mention(chef), inline=True)
        embed.add_field(name="🎫 Ticket", value=f"#{ticket['number']:04d}", inline=True)
        if ticket.get("total"):
            embed.add_field(name="🧾 Order Total", value=money(Decimal(ticket["total"])), inline=True)
            embed.add_field(name="💵 Paid", value=money(Decimal(ticket["due"])), inline=True)
            embed.add_field(name="💳 Payment", value=ticket["payment"] or "—", inline=True)
        stamp(embed, f"Ticket #{ticket['number']:04d}")
        await channel.send(content=mention(ticket["owner_id"]), embed=embed, view=TicketControlView(),
                           allowed_mentions=discord.AllowedMentions(users=True, roles=False, everyone=False))

        log = await get_log_channel(channel.guild)
        if log:
            log_embed = embed.copy()
            log_embed.title = "📦 Order Completed"
            log_embed.description = (
                f"This order from {mention(ticket['owner_id'])} has been done by {mention(chef)}.\n"
                f"Channel: {channel.mention}"
            )
            try:
                await log.send(embed=log_embed, allowed_mentions=discord.AllowedMentions.none())
            except discord.HTTPException:
                pass
        await finish(interaction, "✅ Order marked complete.")


def check_can_close(member: discord.Member, ticket: dict) -> None:
    g = store.guild(ticket["guild_id"])
    if member.id != ticket["owner_id"] and not is_staff(member, g):
        raise TicketError("Only the ticket owner, staff or administrators can close this ticket.")


async def get_log_channel(guild: discord.Guild) -> Optional[discord.TextChannel]:
    g = store.guild(guild.id)
    ch = guild.get_channel(g["log_channel"]) if g["log_channel"] else None
    return ch if isinstance(ch, discord.TextChannel) else None


async def build_transcript(channel: discord.TextChannel) -> discord.File:
    lines = [f"{BRAND} transcript — #{channel.name} ({channel.id})", "=" * 60]
    async for m in channel.history(limit=5000, oldest_first=True):
        parts = [m.content] if m.content else []
        for e in m.embeds:
            parts.append(f"[embed: {e.title or ''} | {(e.description or '').strip()}]")
            for f in e.fields:
                parts.append(f"  {f.name}: {f.value}")
        for a in m.attachments:
            parts.append(f"[attachment: {a.filename} {a.url}]")
        lines.append(f"[{m.created_at:%Y-%m-%d %H:%M:%S} UTC] {m.author} ({m.author.id}): " + "\n".join(parts))
    data = "\n".join(lines).encode("utf-8")
    return discord.File(io.BytesIO(data), filename=f"transcript-{channel.name}.txt")


async def close_ticket(channel: discord.TextChannel, closer: discord.Member, reason: str) -> None:
    ticket = get_ticket_or_fail(channel)
    check_can_close(closer, ticket)
    if ticket.get("closing"):
        raise TicketError("This ticket is already closing.")
    ticket["closing"] = True
    store.set_ticket(channel.id, ticket)

    embed = discord.Embed(
        title="🔒 Ticket Closing",
        description=f"Closed by {closer.mention}. This channel will be deleted in **{CLOSE_DELAY_SECONDS} seconds**.",
        color=COLOR_RED,
    )
    embed.add_field(name="📝 Reason", value=reason[:1024], inline=False)
    await channel.send(embed=stamp(embed))

    log = await get_log_channel(channel.guild)
    if log:
        log_embed = discord.Embed(title="🔒 Ticket Closed", color=COLOR_RED)
        log_embed.add_field(name="🎫 Ticket", value=f"#{ticket['number']:04d} • `{channel.name}`", inline=True)
        log_embed.add_field(name="📂 Type", value=ticket["kind"].upper(), inline=True)
        log_embed.add_field(name="👤 Opened by", value=mention(ticket["owner_id"]), inline=True)
        log_embed.add_field(name="🔒 Closed by", value=closer.mention, inline=True)
        log_embed.add_field(name="🧑‍🍳 Claimed by", value=mention(ticket["claimed_by"]), inline=True)
        log_embed.add_field(name="✅ Completed", value="Yes" if ticket["completed"] else "No", inline=True)
        log_embed.add_field(name="📝 Reason", value=reason[:1024], inline=False)
        try:
            transcript = await build_transcript(channel)
            await log.send(embed=stamp(log_embed), file=transcript, allowed_mentions=discord.AllowedMentions.none())
        except discord.HTTPException as exc:
            print(f"[close] transcript/log failed: {exc}")

    await asyncio.sleep(CLOSE_DELAY_SECONDS)
    store.delete_ticket(channel.id)
    channel_locks.pop(channel.id, None)
    try:
        await channel.delete(reason=f"Ticket closed by {closer}: {reason}")
    except discord.NotFound:
        pass
    except discord.HTTPException as exc:
        print(f"[close] could not delete {channel.id}: {exc}")


# --------------------------------------------------------------------------
# Bot
# --------------------------------------------------------------------------
class MunchiesBot(discord.Client):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(intents=intents)
        self.tree = app_commands.CommandTree(self)

    async def setup_hook(self) -> None:
        for view in (PanelView(), TicketControlView(), AddressConfirmView(), ClaimView(), ClaimedView()):
            self.add_view(view)

    async def sync_guild(self, guild: discord.Guild) -> None:
        self.tree.copy_global_to(guild=guild)
        try:
            cmds = await self.tree.sync(guild=guild)
            print(f"[sync] {guild.name}: {len(cmds)} commands")
        except discord.HTTPException as exc:
            print(f"[sync] {guild.name} failed: {exc}")


bot = MunchiesBot()
tree = bot.tree


@bot.event
async def on_ready():
    print(f"[ready] logged in as {bot.user} ({bot.user.id})")
    invite = discord.utils.oauth_url(
        bot.user.id,
        permissions=discord.Permissions(administrator=True),
        scopes=("bot", "applications.commands"),
    )
    print(f"[ready] invite link: {invite}")
    for guild in bot.guilds:
        await bot.sync_guild(guild)
    # drop tickets whose channels were deleted while the bot was offline
    stale = [cid for cid, t in store.tickets().items()
             if (gd := bot.get_guild(t["guild_id"])) is not None and gd.get_channel(int(cid)) is None]
    for cid in stale:
        store.delete_ticket(int(cid))
    for t in store.tickets().values():
        t.pop("closing", None)  # a close interrupted by a restart must not block closing again
    store.save()
    for guild in bot.guilds:
        await refresh_panels(guild)
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="🍽️ orders"))
    print("[ready] Munchies Order Desk is online ✅")


@bot.event
async def on_guild_join(guild: discord.Guild):
    await bot.sync_guild(guild)


@bot.event
async def on_guild_channel_delete(channel: discord.abc.GuildChannel):
    store.delete_ticket(channel.id)
    channel_locks.pop(channel.id, None)


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot or message.guild is None:
        return
    ticket = store.ticket(message.channel.id)
    if ticket is None or message.author.id != ticket["owner_id"]:
        return
    if ticket["stage"] not in ("address", "screenshot", "payment"):
        return
    async with lock_for(message.channel.id):
        ticket = store.ticket(message.channel.id)
        if ticket is None:
            return
        try:
            await handle_order_message(message, ticket)
        except discord.HTTPException as exc:
            print(f"[order] error in {message.channel.id}: {exc}")


@tree.error
async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError):
    if isinstance(error, app_commands.MissingPermissions):
        msg = "You need **Administrator** to use this command."
    elif isinstance(error, app_commands.NoPrivateMessage):
        msg = "This command only works inside a server."
    elif isinstance(error, app_commands.CommandInvokeError) and isinstance(error.original, discord.Forbidden):
        msg = "I'm missing permissions for that. Give my role **Administrator** (or Manage Channels + Manage Roles)."
    else:
        msg = f"Something went wrong: `{error}`"
        print(f"[command error] {error!r}")
    await send_error(interaction, msg)


# ---- Setup commands ------------------------------------------------------
@tree.command(name="ticket", description="Set up the Munchies ticket system and post the Order Desk panel")
@app_commands.describe(
    staff_role="Role that gets added to every ticket",
    category="Category the tickets will be created in",
    chef_role="Role that gets pinged for new orders (optional, can set later with /setchef)",
    log_channel="Channel for transcripts & completed orders (optional)",
    vip_role="Only this role can open VIP tickets (optional)",
    panel_channel="Where to post the panel (defaults to this channel)",
)
@app_commands.guild_only()
@app_commands.default_permissions(administrator=True)
@app_commands.checks.has_permissions(administrator=True)
async def ticket_cmd(
    interaction: discord.Interaction,
    staff_role: discord.Role,
    category: discord.CategoryChannel,
    chef_role: Optional[discord.Role] = None,
    log_channel: Optional[discord.TextChannel] = None,
    vip_role: Optional[discord.Role] = None,
    panel_channel: Optional[discord.TextChannel] = None,
):
    target = panel_channel or interaction.channel
    if not isinstance(target, discord.TextChannel):
        return await send_error(interaction, "Run this in a normal text channel or pick `panel_channel`.")

    g = store.guild(interaction.guild.id)
    g["staff_role"] = staff_role.id
    g["category"] = category.id
    if chef_role:
        g["chef_role"] = chef_role.id
    if log_channel:
        g["log_channel"] = log_channel.id
    if vip_role:
        g["vip_role"] = vip_role.id
    store.save()

    try:
        panel = await target.send(embed=panel_embed(g), view=PanelView())
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
    if not g["chef_role"]:
        embed.add_field(name="💡 Tip", value="Use `/setchef` so chefs get pinged on new orders.", inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@tree.command(name="setchef", description="Set the chef role that gets pinged for new orders")
@app_commands.describe(role="The chef role")
@app_commands.guild_only()
@app_commands.default_permissions(administrator=True)
@app_commands.checks.has_permissions(administrator=True)
async def setchef_cmd(interaction: discord.Interaction, role: discord.Role):
    g = store.guild(interaction.guild.id)
    g["chef_role"] = role.id
    store.save()
    embed = discord.Embed(
        title="🧑‍🍳 Chef Role Set",
        description=(
            f"{role.mention} will be pinged for every new order and can **claim**, **unclaim** and **complete** orders.\n\n"
            "⚠️ If the role isn't mentionable, give my role **Mention @everyone, @here and All Roles** so the ping works."
        ),
        color=COLOR_GREEN,
    )
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


@tree.command(name="setlogs", description="Set the channel for ticket transcripts and completed orders")
@app_commands.guild_only()
@app_commands.default_permissions(administrator=True)
@app_commands.checks.has_permissions(administrator=True)
async def setlogs_cmd(interaction: discord.Interaction, channel: discord.TextChannel):
    g = store.guild(interaction.guild.id)
    g["log_channel"] = channel.id
    store.save()
    await interaction.response.send_message(
        embed=stamp(discord.Embed(title="📜 Log Channel Set", description=channel.mention, color=COLOR_GREEN)),
        ephemeral=True)


@tree.command(name="panel", description="Re-post the Order Desk panel in this channel")
@app_commands.guild_only()
@app_commands.default_permissions(administrator=True)
@app_commands.checks.has_permissions(administrator=True)
async def panel_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    if not g["category"]:
        return await send_error(interaction, "Run `/ticket` first.")
    if not isinstance(interaction.channel, discord.TextChannel):
        return await send_error(interaction, "Run this in a normal text channel.")
    msg = await interaction.channel.send(embed=panel_embed(g), view=PanelView())
    g["panels"].append([interaction.channel.id, msg.id])
    store.save()
    await interaction.response.send_message("✅ Panel posted.", ephemeral=True)


# ---- Staff clock in/out -------------------------------------------------
@tree.command(name="clockin", description="Clock in — you'll show under Staff Online")
@app_commands.guild_only()
async def clockin_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    if not is_staff(interaction.user, g):
        return await send_error(interaction, "Only staff, chefs or administrators can clock in.")
    if interaction.user.id in g["clocked_in"]:
        return await send_error(interaction, "You're already clocked in. Use `/clockout` when you're done.")
    g["clocked_in"].append(interaction.user.id)
    store.save()
    await interaction.response.defer(ephemeral=True, thinking=True)
    await refresh_panels(interaction.guild)
    embed = discord.Embed(
        title="🟢 Clocked In",
        description=f"{interaction.user.mention} you're now listed under **Staff Online**. Let's cook! 🍳",
        color=COLOR_GREEN,
    )
    embed.add_field(name="👥 Staff Online", value=str(len(g["clocked_in"])), inline=True)
    await interaction.followup.send(embed=stamp(embed), ephemeral=True)


@tree.command(name="clockout", description="Clock out — you'll be removed from Staff Online")
@app_commands.guild_only()
async def clockout_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    if interaction.user.id not in g["clocked_in"]:
        return await send_error(interaction, "You aren't clocked in.")
    g["clocked_in"].remove(interaction.user.id)
    store.save()
    await interaction.response.defer(ephemeral=True, thinking=True)
    await refresh_panels(interaction.guild)
    embed = discord.Embed(
        title="🔴 Clocked Out",
        description=f"{interaction.user.mention} you've been removed from **Staff Online**. Good work! 👋",
        color=COLOR_RED,
    )
    await interaction.followup.send(embed=stamp(embed), ephemeral=True)


@tree.command(name="staffonline", description="See who is clocked in")
@app_commands.guild_only()
async def staffonline_cmd(interaction: discord.Interaction):
    g = store.guild(interaction.guild.id)
    online = g["clocked_in"]
    embed = discord.Embed(
        title="🟢 Staff Online",
        description="\n".join(mention(u) for u in online) if online else "*No staff clocked in right now*",
        color=COLOR_GREEN,
    )
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


# ---- Ticket commands ----------------------------------------------------
@tree.command(name="claim", description="Claim the order in this ticket")
@app_commands.guild_only()
async def claim_cmd(interaction: discord.Interaction):
    await do_claim(interaction)


@tree.command(name="unclaim", description="Unclaim the order in this ticket")
@app_commands.guild_only()
async def unclaim_cmd(interaction: discord.Interaction):
    await do_unclaim(interaction)


@tree.command(name="complete", description="Mark the order in this ticket as done")
@app_commands.guild_only()
async def complete_cmd(interaction: discord.Interaction):
    await do_complete(interaction)


@tree.command(name="close", description="Close and delete this ticket (saves a transcript)")
@app_commands.describe(reason="Why the ticket is being closed")
@app_commands.guild_only()
async def close_cmd(interaction: discord.Interaction, reason: Optional[str] = None):
    try:
        ticket = get_ticket_or_fail(interaction.channel)
        check_can_close(interaction.user, ticket)
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.response.send_message("🔒 Closing ticket…", ephemeral=True)
    try:
        await close_ticket(interaction.channel, interaction.user, reason or "No reason given")
    except TicketError as exc:
        await send_error(interaction, str(exc))


@tree.command(name="add", description="Add a member to this ticket")
@app_commands.guild_only()
async def add_cmd(interaction: discord.Interaction, member: discord.Member):
    try:
        get_ticket_or_fail(interaction.channel)
        if not is_staff(interaction.user, store.guild(interaction.guild.id)):
            raise TicketError("Only staff can add members to tickets.")
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.channel.set_permissions(
        member,
        overwrite=discord.PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True,
                                              embed_links=True, read_message_history=True),
        reason=f"Added by {interaction.user}",
    )
    embed = discord.Embed(description=f"➕ {member.mention} was added to the ticket by {interaction.user.mention}.",
                          color=COLOR_GREEN)
    await interaction.response.send_message(embed=stamp(embed))


@tree.command(name="remove", description="Remove a member from this ticket")
@app_commands.guild_only()
async def remove_cmd(interaction: discord.Interaction, member: discord.Member):
    try:
        ticket = get_ticket_or_fail(interaction.channel)
        if not is_staff(interaction.user, store.guild(interaction.guild.id)):
            raise TicketError("Only staff can remove members from tickets.")
        if member.id == ticket["owner_id"]:
            raise TicketError("You can't remove the ticket owner — close the ticket instead.")
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    await interaction.channel.set_permissions(member, overwrite=None, reason=f"Removed by {interaction.user}")
    embed = discord.Embed(description=f"➖ {member.mention} was removed from the ticket by {interaction.user.mention}.",
                          color=COLOR_RED)
    await interaction.response.send_message(embed=stamp(embed))


@tree.command(name="rename", description="Rename this ticket channel")
@app_commands.guild_only()
async def rename_cmd(interaction: discord.Interaction, name: str):
    try:
        get_ticket_or_fail(interaction.channel)
        if not is_staff(interaction.user, store.guild(interaction.guild.id)):
            raise TicketError("Only staff can rename tickets.")
    except TicketError as exc:
        return await send_error(interaction, str(exc))
    new = slugify(name) if name.strip() else None
    if not new:
        return await send_error(interaction, "Give a valid name.")
    await interaction.response.defer(ephemeral=True, thinking=True)
    await interaction.channel.edit(name=new[:90], reason=f"Renamed by {interaction.user}")
    await interaction.followup.send(f"✏️ Renamed to `{new}`.", ephemeral=True)


@tree.command(name="help", description="Show all Munchies bot commands")
async def help_cmd(interaction: discord.Interaction):
    embed = discord.Embed(title=f"🍽️ {BRAND} Bot — Commands", color=COLOR_BLURPLE)
    embed.add_field(name="⚙️ Setup (Admin)", value=(
        "`/ticket` — set staff role + category and post the panel\n"
        "`/setchef` — set the chef role that gets pinged\n"
        "`/setlogs` — set the transcript / log channel\n"
        "`/panel` — re-post the panel here"), inline=False)
    embed.add_field(name="🕒 Staff", value=(
        "`/clockin` — show under Staff Online\n"
        "`/clockout` — leave Staff Online\n"
        "`/staffonline` — see who's working"), inline=False)
    embed.add_field(name="🎫 Tickets", value=(
        "`/claim` — claim the order (locks chat to customer + you + admins)\n"
        "`/unclaim` — give the order back\n"
        "`/complete` — mark the order done\n"
        "`/close` — close & delete the ticket (transcript saved)\n"
        "`/add` · `/remove` · `/rename` — manage the ticket"), inline=False)
    await interaction.response.send_message(embed=stamp(embed), ephemeral=True)


# --------------------------------------------------------------------------
if __name__ == "__main__":
    if not TOKEN or TOKEN == "PASTE_YOUR_BOT_TOKEN_HERE":
        raise SystemExit("Set DISCORD_TOKEN or paste your bot token into TOKEN at the top of main.py")
    try:
        bot.run(TOKEN)
    except discord.PrivilegedIntentsRequired:
        raise SystemExit(
            "Enable 'MESSAGE CONTENT INTENT' at https://discord.com/developers/applications -> your app -> Bot, then run again."
        )
    except discord.LoginFailure:
        raise SystemExit("Discord rejected the token. Reset it in the Developer Portal (Bot -> Reset Token) and paste the new one.")
