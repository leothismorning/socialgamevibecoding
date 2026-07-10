# Vibecoding Study Prototype

Single-project CHI experiment prototype for collaborative vibecoding. The current flow is:

Creator uploads/creates one project → participants P01-P20 join → experience → timed comments → round budget allocation → comment investment → automatic top-three selection (creator resolves ties only) → AI fusion plan → visible initial candidate → transparent multi-turn AI Studio debugging → Creator publishes the working candidate → preview next version → continue or propose a project-end vote.

- Participant budget each round: `100 + total investment received by their comments in the previous round`.
- Creator budget each round: fixed at `200`.
- Creator can safely roll back the current phase; investments and generated-version state are undone where necessary.
- A project ends only when more than 75% of joined participants vote to end it. The ended project remains available as a read-only round and version archive.
- DeepSeek output is saved as a candidate draft first. Every participant can watch the candidate preview and Creator/AI debugging transcript live, but only Creator can send debugging messages, roll back a candidate, or publish it as the official round version.
- Starting a new experiment creates a new experiment ID and archives the previous one. Historical experiments keep their participant snapshot, comments, investments, candidate drafts, AI conversation, votes, and versions, and remain available from the in-app archive browser.

## Run Locally

**Prerequisites:** Node.js

1. Install dependencies: `npm install`
2. Set `DEEPSEEK_API_KEY` in `.env.local`
3. Start the local React + Express + SQLite app: `npm run dev`
4. Open `http://localhost:3000`

The local SQLite database is created at `data/vibecoding-study.db` and is ignored by git.
