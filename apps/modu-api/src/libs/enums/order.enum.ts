import { registerEnumType } from '@nestjs/graphql';

/**
 * PAUSE is the cart. createOrder moves it to PROCESS.
 * One collection therefore serves cart and order history alike.
 */
export enum OrderStatus {
	PAUSE = 'PAUSE',
	PROCESS = 'PROCESS',
	FINISH = 'FINISH',
	CANCEL = 'CANCEL',
}
registerEnumType(OrderStatus, { name: 'OrderStatus' });
