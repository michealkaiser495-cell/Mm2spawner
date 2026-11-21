# Food and b4u Order Desk bot (v5)

1. `pip install -U -r requirements.txt`  (needs discord.py 2.7+)
2. Put your token in `TOKEN` at the top of `main.py` (or set `DISCORD_TOKEN`).
3. `python main.py` - the console prints an invite link (Administrator).
4. In your server (as owner): `/ticket staff_role:@Staff category:Tickets chef_role:@Chef log_channel:#logs`

Optional: Developer Portal -> Bot -> MESSAGE CONTENT INTENT lets customers type answers in chat.
Without it, customers use the pop-up forms (buttons) and everything still works.

Slash commands are restricted to the server owner/admins and the chef role.
Owner only: /ticket /setchef /setlogs /panel /blacklist /unblacklist /listadd /listremove
Owner + chef: /clockin /clockout /staffonline /stats /leaderboard /claim /unclaim /complete /close
              /orderinfo /queue /list /add /remove /rename /help
              /set /unset /mypay /pay  (+ type .venmo .cashapp .pay ... in a ticket)

Chef buttons after claiming: Payment Received -> Order Placed -> On The Way -> Mark Complete.
Customers rate the chef 1-5 stars after completion and get a DM receipt.

Pricing: customers pay $10 for every $30 (1/3). Panel has Restaurants + Price Calculator buttons.

The bot restarts itself if it crashes, refuses to run twice, and writes foodb4u.log next to main.py.
