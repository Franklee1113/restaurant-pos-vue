import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import LoginView from '../LoginView.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useRouter } from 'vue-router'

vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}))

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    login: vi.fn(),
  })),
}))

describe('LoginView', () => {
  let loginMock: ReturnType<typeof vi.fn>
  let replaceMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    loginMock = vi.fn()
    replaceMock = vi.fn()
    vi.mocked(useAuthStore).mockReturnValue({ login: loginMock } as any)
    vi.mocked(useRouter).mockReturnValue({ replace: replaceMock } as any)
  })

  it('应渲染登录表单', () => {
    const wrapper = mount(LoginView)
    expect(wrapper.find('h1').text()).toBe('智能点菜系统')
    expect(wrapper.find('input[type="email"]').exists()).toBe(true)
    expect(wrapper.find('input[type="password"]').exists()).toBe(true)
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('登录成功应跳转到订单列表', async () => {
    loginMock.mockResolvedValue({ success: true })
    const wrapper = mount(LoginView)

    const emailInput = wrapper.find('input[type="email"]')
    const passwordInput = wrapper.find('input[type="password"]')
    await emailInput.setValue('admin@restaurant.com')
    await passwordInput.setValue('REDACTED_DEFAULT_PASSWORD')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(loginMock).toHaveBeenCalledWith('admin@restaurant.com', 'REDACTED_DEFAULT_PASSWORD')
    expect(replaceMock).toHaveBeenCalledWith({ name: 'orderList' })
  })

  it('登录失败应显示错误信息', async () => {
    loginMock.mockResolvedValue({ success: false, error: '密码错误' })
    const wrapper = mount(LoginView)

    await wrapper.find('input[type="email"]').setValue('admin@restaurant.com')
    await wrapper.find('input[type="password"]').setValue('wrong')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('密码错误')
    expect(replaceMock).not.toHaveBeenCalled()
  })

  it('登录失败无错误信息时应显示默认提示', async () => {
    loginMock.mockResolvedValue({ success: false })
    const wrapper = mount(LoginView)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('登录失败')
  })

  it('提交时应显示加载状态', async () => {
    let resolveLogin: (value: any) => void
    const loginPromise = new Promise((resolve) => {
      resolveLogin = resolve
    })
    loginMock.mockReturnValue(loginPromise)

    const wrapper = mount(LoginView)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').text()).toContain('登录中')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()

    resolveLogin!({ success: true })
    await flushPromises()

    expect(wrapper.find('button[type="submit"]').text()).toContain('登录')
  })

  it('开发环境应显示默认账号提示', () => {
    const wrapper = mount(LoginView)
    // isDev 取决于 import.meta.env.DEV，在测试环境中通常为 true
    const devInfo = wrapper.findAll('div').find((d) => d.text().includes('开发环境默认账号'))
    expect(devInfo).toBeDefined()
  })
})
