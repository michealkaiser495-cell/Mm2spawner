# Food and b4u Order Desk bot (v11)

1. `pip install -U -r requirements.txt`  (needs discord.py 2.7+)
2. Put your token in `TOKEN` at the top of `main.py` (or set `DISCORD_TOKEN`).
3. `python main.py` - the console prints an invite link (Administrator).
4. In your server (as owner): `/ticket staff_role:@Staff category:Tickets chef_role:@Chef log_channel:#logs`

Optional: Developer Portal -> Bot -> MESSAGE CONTENT INTENT lets customers type answers in chat.
Without it, customers use the pop-up forms (buttons) and everything still works.

Slash commands are restricted to the server owner/admins and the chef role.
Owner only: /ticket /setchef /setlogs /panel /blacklist /unblacklist /listadd /listremove
            /set vouch /buyer /givestars /aisupport
Owner + chef: /clockin /clockout /staffonline /stats /leaderboard /claim /unclaim /complete /close
              /orderinfo /queue /list /notify /ai /add /remove /rename /help
              /set payment /unset /mypay /pay  (+ type .venmo .cashapp .pay ... in a ticket)

Chef buttons after claiming: Payment Received -> Order Placed -> On The Way -> Mark Complete.
Customers rate the chef 1-5 stars after completion and get a DM receipt.

Pricing: customers pay $10 for every $30 (1/3). Panel has Restaurants + Price Calculator buttons.

The bot restarts itself if it crashes, refuses to run twice, and writes foodb4u.log next to main.py.

Vouches: after completion the customer gets the buyer role and a Leave a Vouch button (stars + screenshot ->
vouch channel, +1 star each). Everyone: /stars, /free order (10 stars = free order, pings owners).

Claimed orders show a copyable delivery address and a Full Address button (exact street/city/state/ZIP via
the free US Census geocoder, OpenStreetMap as fallback). /notify DMs the customer a link to their ticket.

AI support (Claude, optional) — NO API KEY NEEDED:
  1. Log into Claude on the PC that runs the bot: `ant auth login` (Anthropic CLI). The bot reads that login
     automatically. (Alternatives: set ANTHROPIC_AUTH_TOKEN, or an ANTHROPIC_API_KEY if you prefer a key.)
  2. Restart the bot, then the owner runs /aisupport on.
Customers get an "Ask AI" button in support tickets; chefs get an "AI Assist" button on claimed orders and /ai.
Model defaults to claude-opus-4-6 (change with /aisupport ... model:). Replies use the fewest tokens possible
(short answers, no thinking budget, low effort). Without a Claude login, everything else works unchanged.
  pip install -U -r requirements.txt   (now also installs the anthropic SDK)

The bot never crashes if the AI library is missing — it auto-installs `anthropic` on first run and, if that
fails, just runs with AI off. Easiest way to turn AI on: paste a Claude key/token into AI_TOKEN near the top
of main.py (same spot idea as the Discord token).

/cheflog @chef (owner): makes a private log channel only that chef (and admins) can see.
