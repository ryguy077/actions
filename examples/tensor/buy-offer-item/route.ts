import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ActionError, ActionGetResponse, ActionPostRequest, ActionPostResponse } from '@solana/actions';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getNftInfo, placeNftBid } from '../../../api/tensor-api';
import { createBuyNftTransaction } from './transaction-utils';
import { formatTokenAmount } from '../../../shared/number-formatting-utils';
import { connection } from '../../../shared/connection';
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
  if (!itemId) {
    return c.json(
      {
        message: `Item ID is required`,
      } satisfies ActionError,
      {
        status: 400,
      },
    );
  }

  const itemDetails = await getNftInfo(itemId);
  console.log('Item details:', itemDetails);

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
    uiPrice && { label: `BUY ${uiPrice} SOL`, href: `/api/tensor/buy-offer-item/item/${itemId}/buy` },
    { href: `/api/tensor/buy-offer-item/item/${itemId}/offer/{offerAmount}`, label: 'Make an Offer', parameters: [{ name: amountParameterName, label: 'Enter an offer amount in SOL' }] },
  ].filter((action): action is { label: string; href: string; parameters?: { name: string; label: string }[] } => action !== null);

  const response: ActionGetResponse = {
    icon: itemDetails.imageUri,
    label: uiPrice ? `${uiPrice} SOL` : 'Make an Offer',
    title: itemDetails.name,
    description: 'Buy an NFT!' ?? 'No description available',
    links: { actions },
  };

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
    console.log('Request body:', requestBody);

    const { account } = requestBody as ActionPostRequest;

    const itemDetails = await getNftInfo(itemId);
    console.log('Item details:', itemDetails);

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

    const transaction = await createBuyNftTransaction(itemDetails.onchainId, account);

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: transaction,
    };

    return c.json(response);
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
  path: '/item/{itemId}/offer/{offerAmount}',
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
      offerAmount: z.string().openapi({
        param: {
          name: 'offerAmount',
          in: 'path',
        },
        type: 'string',
        example: '0.19',
      }),
    }),
    body: z.object({
      account: z.string().openapi({
        description: 'The Solana account making the offer',
        example: 'YourSolanaAccountHere',
      }),
    }).openapi({
      required: ['account'],
    }),
  },
  responses: actionsSpecOpenApiPostResponse,
}), async (c) => {
  const itemId = c.req.param('itemId');
  const offerAmountParam = c.req.param('offerAmount');

  if (!itemId) {
    return c.json(
      {
        message: `Item ID is required`,
      } satisfies ActionError,
      {
        status: 400,
      },
    );
  }

  if (!offerAmountParam || isNaN(parseFloat(offerAmountParam))) {
    return c.json(
      {
        message: `Offer amount is not a valid number`,
      } satisfies ActionError,
      {
        status: 400,
      },
    );
  }

  const offerAmount = parseFloat(offerAmountParam);

  try {
    const requestBody = await c.req.json();
    console.log('POST Offer Request Body:', requestBody);
    const { account } = requestBody as { account: string };

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

    const blockhash = await connection.getLatestBlockhash({ commitment: 'max' }).then(res => res.blockhash);
    console.log('Blockhash:', blockhash);

    const priceInLamports = offerAmount * LAMPORTS_PER_SOL;
    console.log('Price in Lamports:', priceInLamports);

    if (isNaN(priceInLamports)) {
      throw new Error('Price in Lamports is not a valid number');
    }

    const transaction = await placeNftBid({
      targetID: itemDetails.onchainId,
      ownerAddress: itemDetails.owner,
      price: priceInLamports,
      buyerAddress: account,
      latestBlockhash: blockhash,
    });

    if (!transaction) {
      throw new Error('Failed to create transaction');
    }

    const response: ActionPostResponse = {
      transaction: transaction,
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
