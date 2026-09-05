import { registerEnumType } from '@nestjs/graphql';

/**
 * The single catalogue of every user-facing message the API can produce.
 * Not registered with GraphQL — it is a server-side constant catalogue.
 */
export enum Message {
	SOMETHING_WENT_WRONG = 'Something went wrong!',
	NO_DATA_FOUND = 'No data found!',
	CREATE_FAILED = 'Create failed!',
	UPDATE_FAILED = 'Update failed!',
	REMOVE_FAILED = 'Remove failed!',
	UPLOAD_FAILED = 'Upload failed!',
	BAD_REQUEST = 'Bad Request',

	USED_MEMBER_NICK_OR_PHONE = 'Already used member nick or phone',
	NO_MEMBER_NICK = 'No member with that nickname!',
	WRONG_PASSWORD = 'Wrong password, try again!',
	NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
	BLOCKED_USER = 'You have been blocked!',
	TOKEN_NOT_EXIST = 'Bearer Token is not provided!',
	ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
	NOT_ALLOWED_REQUEST = 'Not Allowed Request!',
	PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, png, or jpeg images!',
	SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',

	/** commerce */
	OUT_OF_STOCK = 'Product is out of stock!',
	NOT_ENOUGH_STOCK = 'Requested quantity exceeds available stock!',
	EMPTY_CART = 'Your cart is empty!',
	ORDER_NOT_CANCELLABLE = 'This order can no longer be cancelled!',
	NOT_PURCHASED_PRODUCT = 'Only buyers of this product may review it!',
	ALREADY_REVIEWED = 'You have already reviewed this product!',
	INVALID_DISCOUNT = 'Discount must be between 0 and 99 percent!',

	/** returns */
	RETURN_WINDOW_EXPIRED = 'The return window for this order has closed!',
	RETURN_NOT_ELIGIBLE = 'This order is not eligible for return!',
	RETURN_QUANTITY_EXCEEDED = 'Return quantity exceeds what is left of this purchase!',
	RETURN_NOT_UPDATABLE = 'This return can no longer move to that status!',
	RETURN_NOT_CANCELLABLE = 'Only a pending return request can be cancelled!',
}

export enum Direction {
	ASC = 1,
	DESC = -1,
}
registerEnumType(Direction, { name: 'Direction' });
