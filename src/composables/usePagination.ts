import { ref, computed } from 'vue'

export function usePagination(initialPage = 1) {
  const currentPage = ref(initialPage)
  const totalPages = ref(1)
  const pageSize = ref(20)

  const visiblePages = computed(() => {
    const pages: (number | string)[] = []
    for (let i = 1; i <= totalPages.value; i++) {
      if (i === 1 || i === totalPages.value || (i >= currentPage.value - 2 && i <= currentPage.value + 2)) {
        pages.push(i)
      } else if (i === currentPage.value - 3 || i === currentPage.value + 3) {
        pages.push('...')
      }
    }
    return pages
  })

  function goToPage(page: number) {
    if (page < 1 || page > totalPages.value) return
    currentPage.value = page
  }

  function reset() {
    currentPage.value = 1
  }

  function setTotal(total: number) {
    totalPages.value = Math.max(1, Math.ceil(total / pageSize.value))
  }

  return {
    currentPage,
    totalPages,
    pageSize,
    visiblePages,
    goToPage,
    reset,
    setTotal,
  }
}
