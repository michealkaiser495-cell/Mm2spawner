# Food and b4u Order Desk bot (v3)

1. `pip install -U -r requirements.txt`  (needs discord.py 2.7+)
2. Put your token in `TOKEN` at the top of `main.py` (or set `DISCORD_TOKEN`).
3. `python main.py` - the console prints an invite link (Administrator).
4. In your server (as owner): `/ticket staff_role:@Staff category:Tickets chef_role:@Chef log_channel:#logs`

Optional: Developer Portal -> Bot -> MESSAGE CONTENT INTENT lets customers type answers in chat.
Without it, customers use the pop-up forms (buttons) and everything still works.

Slash commands are restricted to the server owner/admins and the chef role.
Owner only: /ticket /setchef /setlogs /panel /blacklist /unblacklist
Owner + chef: /clockin /clockout /staffonline /stats /leaderboard /claim /unclaim /complete /close
              /orderinfo /add /remove /rename /help

Chef buttons after claiming: Payment Received -> Order Placed -> On The Way -> Mark Complete.
Customers rate the chef 1-5 stars after completion and get a DM receipt.
