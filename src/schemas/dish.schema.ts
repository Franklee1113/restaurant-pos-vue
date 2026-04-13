import { z } from 'zod'

export const dishFormSchema = z.object({
  name: z.string().min(1, '菜品名称不能为空').max(50, '名称最多50个字符'),
  category: z.string().min(1, '请选择分类'),
  price: z.number().positive('价格必须大于0').max(99999, '价格超出范围'),
})

export type DishFormData = z.infer<typeof dishFormSchema>
