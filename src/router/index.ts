import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import MainLayout from '@/layouts/MainLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/kitchen',
      name: 'kitchen',
      component: () => import('@/views/KitchenDisplayView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: MainLayout,
      children: [
        {
          path: '',
          name: 'orderList',
          component: () => import('@/views/OrderListView.vue'),
        },
        {
          path: 'create-order',
          name: 'createOrder',
          component: () => import('@/views/OrderFormView.vue'),
        },
        {
          path: 'edit-order/:orderId',
          name: 'editOrder',
          component: () => import('@/views/OrderFormView.vue'),
        },
        {
          path: 'order-detail/:orderId',
          name: 'orderDetail',
          component: () => import('@/views/OrderDetailView.vue'),
        },
        {
          path: 'dishes',
          name: 'dishManagement',
          component: () => import('@/views/DishManagementView.vue'),
        },
        {
          path: 'statistics',
          name: 'statistics',
          component: () => import('@/views/StatisticsView.vue'),
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/views/SettingsView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()
  if (!to.meta.public && !authStore.isLoggedIn) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router
