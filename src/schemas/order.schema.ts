import { z } from 'zod'

export const orderItemSchema = z.object({
  dishId: z.string().min(1, '菜品ID不能为空'),
  name: z.string().min(1, '菜品名称不能为空'),
  price: z.number().nonnegative('价格不能为负数'),
  quantity: z.number().positive('数量必须大于0'),
  status: z.string().optional(),
})

// 餐具类型枚举
export const CutleryType = {
  FREE: 'free',      // 免费餐具
  CHARGED: 'charged', // 收费餐具
} as const

export type CutleryTypeValue = typeof CutleryType[keyof typeof CutleryType]

// 餐具配置 Schema
export const cutleryConfigSchema = z.object({
  type: z.enum([CutleryType.FREE, CutleryType.CHARGED]),
  quantity: z.number().int().nonnegative('餐具数量不能为负数'),
  unitPrice: z.number().nonnegative('单价不能为负数'),
  totalPrice: z.number().nonnegative('总价不能为负数'),
})

export const orderFormSchema = z.object({
  tableNo: z.string().min(1, '请选择桌号'),
  guests: z.number().int().positive('用餐人数必须大于0'),
  items: z.array(orderItemSchema).min(1, '请至少选择一道菜品'),
  discountType: z.enum(['amount', 'percent']),
  discountValue: z.number().nonnegative('折扣不能为负数'),
  // 餐具配置
  cutlery: cutleryConfigSchema.optional(),
})

export type OrderFormData = z.infer<typeof orderFormSchema>
export type OrderItemData = z.infer<typeof orderItemSchema>
export type CutleryConfig = z.infer<typeof cutleryConfigSchema>
