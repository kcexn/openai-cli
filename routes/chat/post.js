const { getOpenAI, getSessionMemory } = require('../../lib/openaiClient');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { randomUUID } = require('node:crypto');

const schema = {
  description: 'Send a prompt to the OpenAI chat model and get a completion.',
  tags: ['OpenAI'],
  summary: 'Chat with OpenAI model',
  body: {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: {
        type: 'string',
        description: 'The user prompt to send to the AI model.',
      },
      systemPrompt: {
        type: 'string',
        description: 'The system prompt to send to the AI model.',
        default: 'You are a helpful AI assistant.',
      },
      model: {
        type: 'string',
        description: 'The OpenAI model to use (e.g., gpt-3.5-turbo, gpt-4).',
        default: 'gpt-3.5-turbo',
      },
    },
  },
  response: {
    200: {
      description: 'Successful response from OpenAI',
      type: 'object',
      properties: {
        role: { type: 'string', example: 'assistant' },
        content: { type: 'string', example: 'This is a response from the AI.' },
      },
    },
    400: {
      description: 'Bad Request - Prompt is required',
      type: 'object',
      properties: {
        error: { type: 'string' },
      },
    },
    500: {
      description: 'Internal Server Error',
      type: 'object',
      properties: {
        error: { type: 'string' },
        details: { type: 'string' },
      },
    },
  },
};

const promptTemplate = ChatPromptTemplate.fromMessages([
  ['system', '{systemMessage}'],
  new MessagesPlaceholder('history'),
  ['human', '{prompt}'],
]);
module.exports = async function (app) {
  app.post('/chat', { schema }, async (request, reply) => {
    try {
      const { prompt, systemPrompt, model } = request.body;

      if (!prompt) {
        return reply.code(400).send({ error: 'Prompt is required' });
      }

      let sessionUuid = request.session.sessionUuid;
      if (!sessionUuid) {
        sessionUuid = randomUUID();
        request.session.sessionUuid = sessionUuid;
      }

      const systemMessage = systemPrompt || 'You are a helpful AI assistant.';
      const ai = getOpenAI(model);
      const sessionMemory = getSessionMemory(sessionUuid, ai);
      const memoryVariables = await sessionMemory.loadMemoryVariables({});

      const messages = await promptTemplate.invoke({
        systemMessage,
        history: [...memoryVariables.history],
        prompt,
      });
      const aiResponse = await ai.invoke(messages);
      await sessionMemory.saveContext({ input: prompt }, { output: aiResponse.content });
      return reply.send({ role: 'assistant', content: aiResponse.text });
    } catch (error) {
      app.log.error('Error calling OpenAI:', error.message);
      return reply.code(500).send({ error: 'Failed to communicate with OpenAI', details: error.message });
    }
  });
};
