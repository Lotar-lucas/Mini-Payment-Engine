import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (): Promise<APIGatewayProxyResultV2> => ({
  statusCode: 200,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    status: 'ok',
    stage: process.env.STAGE,
    timestamp: new Date().toISOString(),
  }),
});
