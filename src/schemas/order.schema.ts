import { z } from 'zod'

export const orderItemSchema = z.object({
  dishId: z.string().min(1, '菜品ID不能为空'),
  name: z.string().min(1, '菜品名称不能为空'),
  price: z.number().nonnegative('价格不能为负数'),
  quantity: z.number().positive('数量必须大于0'),
})

export const orderFormSchema = z.object({
  tableNo: z.string().min(1, '请选择桌号'),
  guests: z.number().int().positive('用餐人数必须大于0'),
  items: z.array(orderItemSchema).min(1, '请至少选择一道菜品'),
  discountType: z.enum(['amount', 'percent']),
  discountValue: z.number().nonnegative('折扣不能为负数'),
})

export type OrderFormData = z.infer<typeof orderFormSchema>
export type OrderItemData = z.infer<typeof orderItemSchema>
