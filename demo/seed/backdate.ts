import pg from 'pg';

import type { Backdate } from '#seed/context.ts';

// 서버 API는 작성 시각을 받지 않아서, 넣은 뒤에 DB에서 시각만 과거로 옮긴다.
// 테이블과 컬럼 이름은 서버의 Drizzle schema를 따른다. schema가 바뀌면 여기도 고친다.
export async function applyBackdates(
  databaseUrl: string,
  backdates: readonly Backdate[],
  systemMessageAt: Date,
): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('begin');
    for (const item of backdates) {
      switch (item.kind) {
        case 'project':
          await client.query(
            'update project set created_at = $2, updated_at = $3 where id = $1',
            [item.id, item.createdAt, item.updatedAt],
          );
          await client.query(
            'update project_column set created_at = $2, updated_at = $2 where project_id = $1',
            [item.id, item.createdAt],
          );
          break;
        case 'ticket':
          await client.query(
            'update ticket set created_at = $2, updated_at = $3 where id = $1',
            [item.id, item.createdAt, item.updatedAt],
          );
          break;
        case 'ticketComment':
          await client.query(
            'update ticket_comment set created_at = $2, updated_at = $2 where id = $1',
            [item.id, item.at],
          );
          break;
        case 'wikiDocument':
          await client.query(
            'update wiki_document set created_at = $2, updated_at = $2, collaboration_persisted_at = $2 where id = $1',
            [item.id, item.at],
          );
          await client.query(
            'update wiki_document_revision set created_at = $2 where document_id = $1',
            [item.id, item.at],
          );
          break;
        case 'chatMessage':
          await client.query(
            'update chat_message set created_at = $2, updated_at = $2 where id = $1',
            [item.id, item.at],
          );
          break;
        case 'chatConversation':
          await client.query(
            'update chat_conversation set created_at = $2, updated_at = $3 where id = $1',
            [item.id, item.startedAt, item.updatedAt],
          );
          await client.query(
            'update chat_participant set joined_at = $2 where conversation_id = $1',
            [item.id, item.startedAt],
          );
          break;
      }
    }

    // 조직 초대는 시스템 메시지로 남는다. 오래전에 합류한 것처럼 보이게 옮긴다.
    await client.query(
      `update chat_conversation set created_at = $1, updated_at = $1
       where id in (select conversation_id from chat_message where sender_kind = 'system')`,
      [systemMessageAt],
    );
    await client.query(
      `update chat_participant set joined_at = $1
       where conversation_id in (select conversation_id from chat_message where sender_kind = 'system')`,
      [systemMessageAt],
    );
    await client.query(
      `update chat_message set created_at = $1, updated_at = $1 where sender_kind = 'system'`,
      [systemMessageAt],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}
