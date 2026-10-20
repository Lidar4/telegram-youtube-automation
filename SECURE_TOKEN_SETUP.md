# Secure Token Setup (Never paste tokens into ChatGPT)

## Important limitation
A token pasted into a normal ChatGPT message is visible to the conversation system. There is no special secret textbox inside this chat that guarantees the assistant cannot receive it. **Do not send your Telegram token in chat, screenshots, source code, issues, or commit messages.**

## Store the token directly in GitHub
1. Open the repository: https://github.com/Lidar4/telegram-youtube-automation
2. Select **Settings**. If you do not see it, you may not have admin access.
3. Open **Secrets and variables → Actions**.
4. Select **New repository secret**.
5. Set the name to `TELEGRAM_BOT_TOKEN`.
6. Paste the token into GitHub's **Secret** value field, then save it. Do not paste it into ChatGPT.
7. Your future deployment/workflow must read it as an environment variable, for example `TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN }}`. Never echo it, print it, or put it in logs.

## If running on a hosting provider
Add `TELEGRAM_BOT_TOKEN` in that provider's private Environment Variables / Secrets settings. Use the same exact variable name. Do not commit a real `.env` file.

## Safety checklist
- Use only a private secret settings page for the actual value.
- Keep `.env` ignored by Git.
- Never use a real token in examples; use placeholders only.
- Do not print environment variables in logs or diagnostic output.
- If a token is accidentally exposed, revoke it with Telegram's BotFather and generate a replacement.
- Repository secrets are encrypted by GitHub, but repository administrators and authorized workflows can still control how they are used. Only add trusted workflows and collaborators.

## Current status
This document explains safe storage. It does not configure a GitHub secret automatically, and it does not mean the bot is deployed or running. You must add the secret yourself in GitHub Settings; the assistant does not need to see the token.
