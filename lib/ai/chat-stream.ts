import type { CoreMessage, DataStreamWriter } from 'ai';

export function appendChatTasks(messages: CoreMessage[], tasks: string[]): CoreMessage[] {
  const result = [...messages];
  const last = result.at(-1);
  if (last?.role !== 'user' || tasks.length === 0) return result;
  const taskText = `Research subtasks:\n${tasks.join('\n')}`;
  result[result.length - 1] = {
    ...last,
    content: typeof last.content === 'string'
      ? `${last.content}\n\n${taskText}`
      : [...last.content, { type: 'text', text: taskText }],
  };
  return result;
}

export function streamChatResult(result: {
  mergeIntoDataStream: (writer: DataStreamWriter) => void;
  text: PromiseLike<string>;
}, writer: DataStreamWriter): Promise<string> {
  result.mergeIntoDataStream(writer);
  return Promise.resolve(result.text);
}