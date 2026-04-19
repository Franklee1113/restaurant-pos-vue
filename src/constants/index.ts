/**
 * P2-1: 全局常量定义
 * 消除魔法字符串，统一维护高频使用的标识符
 */

// localStorage keys
export const STORAGE_KEY_TOKEN = 'pb_token'
export const STORAGE_KEY_USER = 'pb_user'

// PocketBase collection names
export const COLLECTION_ORDERS = 'orders'
export const COLLECTION_DISHES = 'dishes'
export const COLLECTION_SETTINGS = 'settings'
export const COLLECTION_TABLE_STATUS = 'table_status'
export const COLLECTION_USERS = 'users'

// API path segments
export const API_AUTH_WITH_PASSWORD = '/api/collections/users/auth-with-password'

// Order item status
export const ITEM_STATUS_PENDING = 'pending'
export const ITEM_STATUS_COOKING = 'cooking'
export const ITEM_STATUS_COOKED = 'cooked'
export const ITEM_STATUS_SERVED = 'served'
