# Vibecoding Study Prototype

Single-project CHI experiment prototype for collaborative vibecoding. The current flow is:

Creator uploads/creates one project → participants P01-P20 join → experience → each participant submits one editable Idea and earns 100 Coin → anonymous sealed investment → automatic top-three selection (creator resolves ties only) → atomic author/investor settlement → AI fusion plan → visible initial candidate → transparent multi-turn AI Studio debugging → Creator publishes the working candidate → preview next version → continue or propose a project-end vote.

- Participant Coin carries across rounds. A first valid Idea submission in each round awards `100 Coin`; editing or restoring the same Idea does not award it again.
- Participant investment is capped at `150 Coin` per round and `50 Coin` per Idea, in increments of `10 Coin`. Self-investment is blocked.
- During investing, authors, live totals, rankings, other investors, and other balances are withheld at the API layer. Idea order is randomized per viewer and remains stable for that round.
- At settlement, every author earns `20%` of received investment plus `60/40/30 Coin` for ranks 1-3. Investor returns are `1.8x/1.5x/1.3x/0.5x` for ranks 1/2/3/not selected.
- Creator budget each round: fixed at `200`.
- Creator can safely roll back the current phase; investments, settlement rewards, and generated-version state are undone where necessary.
- A project ends only when more than 75% of joined participants vote to end it. The ended project remains available as a read-only round and version archive.
- DeepSeek output is saved as a candidate draft first. Every participant can watch the candidate preview and Creator/AI debugging transcript live, but only Creator can send debugging messages, roll back a candidate, or publish it as the official round version.
- Starting a new experiment creates a new experiment ID and archives the previous one. Historical experiments keep their participant snapshot, comments, investments, candidate drafts, AI conversation, votes, and versions, and remain available from the in-app archive browser.
- Ended experiments show a final Participant leaderboard ordered by remaining Coin, with author and investor performance details.

The confirmed game specification is in [docs/投资游戏机制设计.md](docs/投资游戏机制设计.md).

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set `DEEPSEEK_API_KEY` in `.env.local`
3. Start the local React + Express + SQLite app: `npm run dev`
4. Open `http://localhost:3000`

The local SQLite database is created at `data/vibecoding-study.db` and is ignored by git.
