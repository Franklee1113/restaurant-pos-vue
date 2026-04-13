import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../LoginView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'orderList', component: { template: '<div>orders</div>' } }],
})

describe('LoginView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders login form', () => {
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    expect(wrapper.find('h1').text()).toBe('智能点菜系统')
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true)
  })

  it('shows error when login fails', async () => {
    const wrapper = mount(LoginView, { global: { plugins: [router] } })
    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ message: '密码错误' }),
      } as any),
    )

    await wrapper.find('button[type="submit"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('.text-red-600').text()).toContain('密码错误')
  })
})
