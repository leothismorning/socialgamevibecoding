
import { SystemLog } from '../types';
import { addLog, createTraceId } from './loggerService';

const DB_URL = "https://d1-get-started.857436500.workers.dev/";

export async function queryDB(sql: string, params: any[] = []): Promise<any[]> {
  const traceId = createTraceId();
  const startTime = performance.now();
  
  const currentLog: SystemLog = {
    id: traceId,
    type: 'db',
    timestamp: Date.now(),
    sql,
    params,
    duration: '0',
    result: null,
    status: 'pending'
  };
  addLog(currentLog);

  try {
    console.group(`%c[DB DEBUG] TRACE:${traceId}`, "color: #818cf8; font-weight: bold;");
    console.log("%cSQL Query:", "color: #34d399; font-weight: bold;", sql);
    console.log("%cParameters:", "color: #34d399; font-weight: bold;", params);
    
    const response = await fetch(DB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    currentLog.duration = duration;

    if (!response.ok) {
      const errorText = await response.text();
      currentLog.status = 'error';
      currentLog.error = `HTTP ${response.status}: ${errorText}`;
      
      console.error(`%c[DB ERROR] HTTP ${response.status} after ${duration}ms`, "color: #f87171; font-weight: bold;");
      console.error("Payload:", errorText);
      console.groupEnd();
      throw new Error(`HTTP Error ${response.status}: ${errorText}`);
    }

    const data: any = await response.json();
    currentLog.result = data;
    currentLog.status = 'success';
    
    console.log(`%c[DB RESPONSE] Received in ${duration}ms:`, "color: #60a5fa; font-weight: bold;", data);
    
    // Case 1: Response is an array (direct results)
    if (Array.isArray(data)) {
      console.groupEnd();
      return data;
    }

    // Case 2: Standard D1 wrapper object
    if (data && typeof data === 'object') {
      if (data.success === false) {
        const detailError = data.error || data.errors?.[0]?.message || JSON.stringify(data);
        currentLog.status = 'error';
        currentLog.error = detailError;
        console.error("%c[D1 LOGICAL ERROR]:", "color: #fb923c; font-weight: bold;", detailError);
        console.groupEnd();
        throw new Error(detailError || "Database operation failed");
      }
      
      const results = data.results || data.result || (data.success === true ? [] : [data]);
      console.groupEnd();
      return results;
    }

    console.groupEnd();
    return [];
  } catch (error) {
    if (error instanceof Error) {
      currentLog.status = 'error';
      currentLog.error = currentLog.error || error.message;
      console.error(`%c[DB CRITICAL ERROR] TRACE:${traceId}:`, "color: #ef4444; font-weight: bold;", error.message);
    }
    console.groupEnd();
    throw error;
  }
}

export async function createComment(userId: string, rootPostId: number, content: string, parentId: number | null = null): Promise<number | null> {
  const sql = `
    INSERT INTO comments (user_id, post_id, parent_id, root_post_id, content)
    VALUES (?, NULL, ?, ?, ?)
    RETURNING id
  `;
  try {
    // If parentId is NULL, it's a top-level comment on the post
    const results = await queryDB(sql, [userId, parentId || rootPostId, rootPostId, content]);
    return results[0]?.id || null;
  } catch (error) {
    console.error("Failed to create comment:", error);
    return null;
  }
}

export async function updateCommentPostId(commentId: number, generatedPostId: number) {
  const sql = `UPDATE comments SET post_id = ? WHERE id = ?`;
  try {
    await queryDB(sql, [generatedPostId, commentId]);
    return true;
  } catch (error) {
    console.error("Failed to update comment post_id:", error);
    return false;
  }
}

export async function fetchComments(postId: number) {
  const sql = `
    SELECT 
      c.*,
      p.status as post_status,
      u.username as author_name,
      u.avatar_url as author_avatar,
      pu.username as parent_author_name
    FROM comments c
    LEFT JOIN posts p ON c.post_id = p.id
    LEFT JOIN users u ON c.user_id = u.id
    LEFT JOIN comments pc ON c.parent_id = pc.id
    LEFT JOIN users pu ON pc.user_id = pu.id
    WHERE c.root_post_id = ?
    ORDER BY c.created_at ASC
  `;
  try {
    return await queryDB(sql, [postId]);
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    return [];
  }
}

export async function fetchCommentByPostId(postId: number) {
  const sql = `SELECT * FROM comments WHERE post_id = ?`;
  try {
    const results = await queryDB(sql, [postId]);
    return results[0] || null;
  } catch (error) {
    console.error("Failed to fetch comment by post ID:", error);
    return null;
  }
}

export async function fetchCommentById(id: number) {
  const sql = `SELECT * FROM comments WHERE id = ?`;
  try {
    const results = await queryDB(sql, [id]);
    return results[0] || null;
  } catch (error) {
    console.error("Failed to fetch comment by ID:", error);
    return null;
  }
}

export async function fetchPostById(id: number) {
  const sql = `SELECT * FROM posts WHERE id = ?`;
  try {
    const results = await queryDB(sql, [id]);
    return results[0] || null;
  } catch (error) {
    console.error("Failed to fetch post by ID:", error);
    return null;
  }
}

export async function fetchConversations(postId: number): Promise<any[]> {
  const sql = `
    SELECT 
      c.*,
      u.username as author_name,
      u.avatar_url as author_avatar
    FROM conversations c
    LEFT JOIN posts p ON c.post_id = p.id
    LEFT JOIN users u ON p.user_id = u.id
    WHERE c.post_id = ? 
    ORDER BY c.created_at ASC, c.id ASC
  `;
  try {
    return await queryDB(sql, [postId]);
  } catch (error) {
    console.error("Failed to fetch conversations:", error);
    return [];
  }
}

export async function createPost(userId: string, title: string, prompts: string[], code: string, parentId: number | null = null, status: 'published' | 'coding' = 'published', id: number | null = null) {
  const sql = id 
    ? `INSERT OR REPLACE INTO posts (id, user_id, parent_id, title, prompt, code_content, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
    : `INSERT INTO posts (user_id, parent_id, title, prompt, code_content, status) VALUES (?, ?, ?, ?, ?, ?)`;
  
  const params = id 
    ? [id, userId, parentId, title, JSON.stringify(prompts), code, status]
    : [userId, parentId, title, JSON.stringify(prompts), code, status];

  try {
    const results = await queryDB(sql, params);
    return id || results[0]?.id;
  } catch (error) {
    console.error("Failed to create/update post:", error);
    throw error;
  }
}

export async function fetchFeedPosts(): Promise<any[]> {
  const sql = `
    SELECT * FROM posts 
    WHERE status = 'published' 
    ORDER BY created_at DESC 
    LIMIT 50
  `;
  try {
    return await queryDB(sql);
  } catch (error) {
    console.error("Failed to fetch feed posts:", error);
    return [];
  }
}

export async function fetchUserPosts(userId: string): Promise<any[]> {
  const sql = `
    SELECT * FROM posts 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `;
  try {
    return await queryDB(sql, [userId]);
  } catch (error) {
    console.error("Failed to fetch user posts:", error);
    return [];
  }
}

export async function logConversation(
  postId: number, 
  role: string, 
  prompt: string, 
  codeSnapshot: string | null = null,
  promptId: number | null = null
): Promise<number | null> {
  try {
    if (role === 'user') {
      // 1. Insert user message with RETURNING id to get the new primary key
      const insertSql = `
        INSERT INTO conversations (post_id, role, prompt, code_snapshot)
        VALUES (?, ?, ?, ?)
        RETURNING id
      `;
      const insertResult = await queryDB(insertSql, [postId, role, prompt, codeSnapshot]);
      const newId = insertResult[0]?.id;

      if (newId) {
        // 2. Update prompt_id to be same as id for user messages as requested
        const updateSql = `UPDATE conversations SET prompt_id = ? WHERE id = ?`;
        await queryDB(updateSql, [newId, newId]);
        console.log(`User log success: ID ${newId}, prompt_id synced`);
        return newId;
      }
    } else {
      // 3. AI message: use provided promptId
      const sql = `
        INSERT INTO conversations (post_id, role, prompt, code_snapshot, prompt_id)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id
      `;
      const result = await queryDB(sql, [postId, role, prompt, codeSnapshot, promptId]);
      console.log(`AI log success: Linked to prompt ${promptId}`);
      return result[0]?.id || null;
    }
  } catch (error) {
    console.error("Failed to log conversation:", error);
  }
  return null;
}
