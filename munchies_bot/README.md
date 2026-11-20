# Munchies Order Desk bot

1. `pip install -r requirements.txt`
2. Developer Portal -> your app -> **Bot** -> turn on **MESSAGE CONTENT INTENT**.
3. Put your token in `TOKEN` at the top of `main.py` (or set `DISCORD_TOKEN`).
4. `python main.py` - the console prints an invite link (Administrator).
5. In your server: `/ticket staff_role:@Staff category:Tickets chef_role:@Chef log_channel:#logs`

Commands: /ticket /setchef /setlogs /panel /clockin /clockout /staffonline
/claim /unclaim /complete /close /add /remove /rename /help
