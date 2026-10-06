import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MessagesAnnotation, StateGraph } from '@langchain/langgraph';

/** 외부 모델이나 네트워크 없이 Agent Protocol 배선을 검증하는 결정적 echo graph다. */
function echo(state: typeof MessagesAnnotation.State): {
  messages: BaseMessage[];
} {
  const lastMessage = state.messages.at(-1);
  const text =
    typeof lastMessage?.content === 'string' ? lastMessage.content : '';
  return { messages: [new AIMessage(`echo: ${text}`)] };
}

export const deterministicAgentGraph = new StateGraph(MessagesAnnotation)
  .addNode('echo', echo)
  .addEdge('__start__', 'echo')
  .addEdge('echo', '__end__')
  .compile();
