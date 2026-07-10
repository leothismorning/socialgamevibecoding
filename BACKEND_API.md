# Vibe.Social Backend API Specification

This document outlines the required API endpoints and data structures for the Vibe Coding social platform.

## 1. Data Models (Schema)

### User
```json
{
  "id": "uuid",
  "name": "string",
  "avatar": "url",
  "bio": "string",
  "createdAt": "timestamp"
}
```

### Post (Project)
```json
{
  "id": "uuid",
  "authorId": "uuid",
  "title": "string",
  "description": "string",
  "code": "text",
  "prompt": "text",
  "tags": ["string"],
  "likes": "number",
  "status": "published | help_requested",
  "parentId": "uuid | null", // Origin project if forked
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### Comment (Iteration)
```json
{
  "id": "uuid",
  "postId": "uuid",
  "authorId": "uuid",
  "content": "text", // Acts as the "evolution prompt"
  "isForkTrigger": "boolean",
  "createdAt": "timestamp"
}
```

---

## 2. API Endpoints

### 2.1 Projects
- **GET /api/posts**: Fetch feed projects (supports pagination & tag filtering).
- **GET /api/posts/:id**: Get single project details with execution-ready code.
- **POST /api/posts**: Create a new project (initial synthesis).
- **PATCH /api/posts/:id**: Update code/status (used during evolution or help sessions).
- **DELETE /api/posts/:id**: Remove a project (author only).

### 2.2 Social & Collaboration
- **GET /api/posts/:id/comments**: Fetch interaction history.
- **POST /api/posts/:id/comments**: Post a comment (new vibe instruction).
- **POST /api/posts/:id/fork**: Special endpoint to create a new post based on an existing one + prompt.
- **POST /api/posts/:id/like**: Toggle like status.

### 2.3 AI Integration (Proxy)
- **POST /api/ai/generate**: Secure proxy to Gemini/LLM to prevent API key exposure on client.
  - *Input*: `{ "prompt": "...", "baseCode": "..." }`
  - *Output*: `{ "code": "..." }`

---

## 3. Real-time Requirements (Optional but Recommended)
For a high-quality "CHI Research" experience, consider using **WebSockets** for:
1. **Live Cursors**: When multiple users are in "Help Mode" on the same project.
2. **Infinite Stream**: Real-time updates when a new vibe is synthesized.
3. **Collaboration Notifications**: "@user just forked your vibe!"

## 4. Security Considerations
- **Content Security Policy (CSP)**: Since we use iframes to run user-generated code, the backend should serve previews with restricted sandboxing.
- **Rate Limiting**: AI generation is expensive; implement limits per user/hour.
