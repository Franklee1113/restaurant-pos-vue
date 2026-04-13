import { z } from 'zod'

export const settingsFormSchema = z.object({
  restaurantName: z.string().min(1, '餐厅名称不能为空').max(100, '名称最多100个字符'),
  address: z.string().max(200, '地址最多200个字符').optional().or(z.literal('')),
  phone: z
    .string()
    .max(20, '电话最多20个字符')
    .regex(/^\d[-\d\s]*$/, '电话格式不正确')
    .optional()
    .or(z.literal('')),
  categories: z.array(z.string().min(1)).min(1, '至少需要一个分类'),
  tableNumbers: z.array(z.string().min(1)).min(1, '至少需要一个桌号'),
})

export type SettingsFormData = z.infer<typeof settingsFormSchema>
