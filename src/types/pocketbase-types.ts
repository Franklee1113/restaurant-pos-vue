/**
* This file was @generated using pocketbase-typegen
*/

export enum Collections {
	Dishes = "dishes",
	Orders = "orders",
	Settings = "settings",
	Users = "users",
}

// Alias types for improved usability
export type IsoDateString = string
export type IsoAutoDateString = string & { readonly autodate: unique symbol }
export type RecordIdString = string
export type FileNameString = string & { readonly filename: unique symbol }
export type HTMLString = string

type ExpandType<T> = unknown extends T
	? T extends unknown
		? { expand?: unknown }
		: { expand: T }
	: { expand: T }

// System fields
export type BaseSystemFields<T = unknown> = {
	id: RecordIdString
	collectionId: string
	collectionName: Collections
} & ExpandType<T>

export type AuthSystemFields<T = unknown> = {
	email: string
	emailVisibility: boolean
	username: string
	verified: boolean
} & BaseSystemFields<T>

// Record types for each collection

export type DishesRecord = {
	category: string
	description?: string
	name: string
	price: number
}

export type OrdersRecord<Tcutlery = unknown, Titems = unknown> = {
	cutlery?: null | Tcutlery
	discount?: number
	discountType?: string
	discountValue?: number
	finalAmount?: number
	guests?: number
	items?: null | Titems
	orderNo: string
	status?: string
	tableNo: string
	totalAmount?: number
}

export type SettingsRecord<Tcategories = unknown, TtableNumbers = unknown> = {
	address?: string
	categories?: null | Tcategories
	phone?: string
	restaurantName?: string
	tableNumbers?: null | TtableNumbers
}

export type UsersRecord = {
	avatar?: FileNameString
	name?: string
}

// Response types include system fields and match responses from the PocketBase API
export type DishesResponse<Texpand = unknown> = Required<DishesRecord> & BaseSystemFields<Texpand>
export type OrdersResponse<Tcutlery = unknown, Titems = unknown, Texpand = unknown> = Required<OrdersRecord<Tcutlery, Titems>> & BaseSystemFields<Texpand>
export type SettingsResponse<Tcategories = unknown, TtableNumbers = unknown, Texpand = unknown> = Required<SettingsRecord<Tcategories, TtableNumbers>> & BaseSystemFields<Texpand>
export type UsersResponse<Texpand = unknown> = Required<UsersRecord> & AuthSystemFields<Texpand>

// Types containing all Records and Responses, useful for creating typing helper functions

export type CollectionRecords = {
	dishes: DishesRecord
	orders: OrdersRecord
	settings: SettingsRecord
	users: UsersRecord
}

export type CollectionResponses = {
	dishes: DishesResponse
	orders: OrdersResponse
	settings: SettingsResponse
	users: UsersResponse
}

// Utility types for create/update operations

type ProcessCreateAndUpdateFields<T> = Omit<{
	// Omit AutoDate fields
	[K in keyof T as Extract<T[K], IsoAutoDateString> extends never ? K : never]: 
		// Convert FileNameString to File
		T[K] extends infer U ? 
			U extends (FileNameString | FileNameString[]) ? 
				U extends any[] ? File[] : File 
			: U
		: never
}, 'id'>

// Create type for Auth collections
export type CreateAuth<T> = {
	id?: RecordIdString
	email: string
	emailVisibility?: boolean
	password: string
	passwordConfirm: string
	verified?: boolean
} & ProcessCreateAndUpdateFields<T>

// Create type for Base collections
export type CreateBase<T> = {
	id?: RecordIdString
} & ProcessCreateAndUpdateFields<T>

// Update type for Auth collections
export type UpdateAuth<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof AuthSystemFields>
> & {
	email?: string
	emailVisibility?: boolean
	oldPassword?: string
	password?: string
	passwordConfirm?: string
	verified?: boolean
}

// Update type for Base collections
export type UpdateBase<T> = Partial<
	Omit<ProcessCreateAndUpdateFields<T>, keyof BaseSystemFields>
>

// Get the correct create type for any collection
export type Create<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? CreateAuth<CollectionRecords[T]>
		: CreateBase<CollectionRecords[T]>

// Get the correct update type for any collection
export type Update<T extends keyof CollectionResponses> =
	CollectionResponses[T] extends AuthSystemFields
		? UpdateAuth<CollectionRecords[T]>
		: UpdateBase<CollectionRecords[T]>
