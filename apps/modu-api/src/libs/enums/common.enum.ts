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
	ORDER_NOT_UPDATABLE = 'This order can no longer move to that status!',
	SIZE_REQUIRED = 'Please choose a size!',
	COLOR_REQUIRED = 'Please choose a color!',
	OPTION_NOT_AVAILABLE = 'That size or color is not available!',

	/** checkout */
	ADDRESS_REQUIRED = 'Please add a shipping address!',
	PAYMENT_REQUIRED = 'Please add a payment method!',
	INVALID_CARD = 'Card number is not valid!',
	CARD_EXPIRED = 'This card has expired!',
	INVALID_ACCOUNT = 'Account number is not valid!',
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
