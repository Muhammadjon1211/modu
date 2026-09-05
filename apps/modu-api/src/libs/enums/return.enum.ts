import { registerEnumType } from '@nestjs/graphql';

/**
 * The return lifecycle.
 *   REQUEST  buyer asked to return          (the only status the buyer can create)
 *   APPROVE  seller accepted, goods coming back
 *   REJECT   seller refused                 (terminal)
 *   COMPLETE goods received, refunded, stock restored (terminal)
 *   CANCEL   buyer withdrew the request     (terminal)
 */
export enum ReturnStatus {
	REQUEST = 'REQUEST',
	APPROVE = 'APPROVE',
	REJECT = 'REJECT',
	COMPLETE = 'COMPLETE',
	CANCEL = 'CANCEL',
}
registerEnumType(ReturnStatus, { name: 'ReturnStatus' });

/** Why the item is coming back. Size is the dominant return reason in clothing. */
export enum ReturnReason {
	DEFECTIVE = 'DEFECTIVE',
	WRONG_ITEM = 'WRONG_ITEM',
	WRONG_SIZE = 'WRONG_SIZE',
	NOT_AS_DESCRIBED = 'NOT_AS_DESCRIBED',
	CHANGED_MIND = 'CHANGED_MIND',
	OTHER = 'OTHER',
}
registerEnumType(ReturnReason, { name: 'ReturnReason' });
