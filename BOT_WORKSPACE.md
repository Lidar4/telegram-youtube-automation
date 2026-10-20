# Telegram Video Bot Workspace

This branch is a safe workspace for converting this repository into a Telegram-only video editing bot.

## Security
- Never commit Telegram bot tokens, API keys, passwords, or .env files.
- Configure the Telegram token as a hosting environment variable named TELEGRAM_BOT_TOKEN.
- Keep any AI provider key in a separate environment variable only if AI features are later added.
- If a token is exposed publicly, revoke it with BotFather and replace it.

## Planned first version
1. Start a Telegram bot using TELEGRAM_BOT_TOKEN.
2. Accept user-uploaded video clips in Telegram.
3. Provide basic editing actions such as joining clips and trimming, using FFmpeg.
4. Return the processed video to the same Telegram chat.
5. Validate file size, duration, processing errors, and temporary-file cleanup.
6. Add deployment instructions and a health check.

## Important
This repository has existing Android diagnostic/dashboard code. Keep the original main branch intact while developing and testing the Telegram bot in this branch. Do not merge or delete the old code until the replacement is reviewed and tested.
