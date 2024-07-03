import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ActionError, ActionGetResponse, ActionPostRequest, ActionPostResponse } from '@solana/actions';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getNftInfo } from '../../../api/tensor-api';
import { createBuyNftTransaction, createBidNftTransaction } from './transaction-utils';
import { formatTokenAmount } from '../../../shared/number-formatting-utils';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../../openapi';

const app = new OpenAPIHono();

app.openapi(createRoute({
  method: 'get',
  path: '/item/{itemId}',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
  },
  responses: actionsSpecOpenApiGetResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');
  const itemDetails = await getNftInfo(itemId);
  if (!itemDetails) {
    return c.json(
      {
        message: `Item ${itemId} not found`,
      } satisfies ActionError,
      {
        status: 422,
      },
    );
  }

  const buyNowPriceNetFees = itemDetails.listing?.price;
  const uiPrice = buyNowPriceNetFees ? formatTokenAmount(parseInt(buyNowPriceNetFees) / LAMPORTS_PER_SOL) : null;
  const amountParameterName = 'offerAmount';

  const actions = [
    uiPrice && { label: `BUY ${uiPrice} SOL`, href: `/api/item/${itemId}/buy` },
    { href: `/api/item/${itemId}/offer`, label: 'Make an Offer', parameters: [{ name: amountParameterName, label: 'Enter an offer amount in SOL' }] },
  ].filter((action): action is { label: string; href: string; parameters?: { name: string; label: string; }[] } => action !== null);

  const response: ActionGetResponse = {
    icon: itemDetails.imageUri,
    label: uiPrice ? `${uiPrice} SOL` : 'Make an Offer',
    title: itemDetails.name,
    description: itemDetails.description,
    links: { actions },
  };

  console.log('GET Response:', JSON.stringify(response, null, 2));

  return c.json(response, 200);
});

app.openapi(createRoute({
  method: 'post',
  path: '/item/{itemId}/buy',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
    body: actionSpecOpenApiPostRequestBody,
  },
  responses: actionsSpecOpenApiPostResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');

  try {
    const requestBody = await c.req.json();
    console.log('POST Buy Request Body:', JSON.stringify(requestBody, null, 2));
    const { account } = requestBody as ActionPostRequest;
    
    const itemDetails = await getNftInfo(itemId);
    if (!itemDetails) {
      return c.json(
        {
          message: `Item ${itemId} not found`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    if (!itemDetails.listing?.price) {
      return c.json(
        {
          message: `Item ${itemId} is not listed for sale`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    const transaction = await createBuyNftTransaction(itemDetails.onchainId, account, itemDetails.listing.price);

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
    };

    console.log('POST Buy Response:', JSON.stringify(response, null, 2));

    return c.json(response, 200);
  } catch (e) {
    console.error(`Failed to prepare buy transaction for ${itemId}`, e);
    return c.json(
      {
        message: `Failed to prepare transaction`,
      } satisfies ActionError,
      {
        status: 500,
      },
    );
  }
});

app.openapi(createRoute({
  method: 'post',
  path: '/item/{itemId}/offer',
  tags: ['Tensor NFT Actions'],
  request: {
    params: z.object({
      itemId: z.string().openapi({
        param: {
          name: 'itemId',
          in: 'path',
        },
        type: 'string',
        example: '7DVeeik8cDUvHgqrTetG6fcDUHHZ8rW7dFHp1SsohKML',
      }),
    }),
    body: z.object({
      account: z.string().openapi({
        description: 'The Solana account making the offer',
        example: 'YourSolanaAccountHere',
      }),
      offerAmount: z.number().openapi({
        description: 'The amount of the offer in SOL',
        example: 1.5,
      }),
    }).openapi({
      required: ['account', 'offerAmount'],
      content: {
        'application/json': {
          schema: z.object({
            account: z.string(),
            offerAmount: z.number(),
          }),
        },
      },
    }),
  },
  responses: actionsSpecOpenApiPostResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');

  try {
    const requestBody = await c.req.json();
    console.log('POST Offer Request Body:', JSON.stringify(requestBody, null, 2));
    const { account, offerAmount } = requestBody as { account: string, offerAmount: number };

    const itemDetails = await getNftInfo(itemId);
    if (!itemDetails) {
      return c.json(
        {
          message: `Item ${itemId} not found`,
        } satisfies ActionError,
        {
          status: 422,
        },
      );
    }

    const transaction = await createBidNftTransaction(itemDetails.onchainId, account, offerAmount * LAMPORTS_PER_SOL);

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: Buffer.from(transaction.serialize()).toString('base64'),
    };

    console.log('POST Offer Response:', JSON.stringify(response, null, 2));

    return c.json(response, 200);
  } catch (e) {
    console.error(`Failed to prepare offer transaction for ${itemId}`, e);
    return c.json(
      {
        message: `Failed to prepare transaction`,
      } satisfies ActionError,
      {
        status: 500,
      },
    );
  }
});

export default app;
