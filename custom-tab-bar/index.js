const tabs = [
  { pagePath: 'pages/index/index', text: '工具', iconPath: '/static/image/gj1.png', selectedIconPath: '/static/image/gj2.png' },
  { pagePath: 'pages/exam/exam', text: '题库', iconPath: '/static/image/st1.png', selectedIconPath: '/static/image/st2.png' },
  { pagePath: 'pages/about/about', text: '关于', iconPath: '/static/image/gy1.png', selectedIconPath: '/static/image/gy2.png' }
]

function currentTabIndex() {
  const pages = getCurrentPages()
  const currentPage = pages[pages.length - 1]
  const route = currentPage && currentPage.route
  const index = tabs.findIndex(item => item.pagePath === route)
  return index < 0 ? 0 : index
}

Component({
  data: {
    selected: 0,
    tablet: false,
    nightMode: false,
    tabs
  },
  lifetimes: {
    attached() {
      const info = wx.getSystemInfoSync()
      this.setData({
        selected: currentTabIndex(),
        tablet: Number(info.windowWidth) >= 768
      })
      if (typeof wx.onWindowResize === 'function') {
        this._onWindowResize = event => {
          const width = Number(event && event.size && event.size.windowWidth)
          if (width) this.setData({ tablet: width >= 768 })
        }
        wx.onWindowResize(this._onWindowResize)
      }
    },
    detached() {
      if (this._onWindowResize && typeof wx.offWindowResize === 'function') {
        wx.offWindowResize(this._onWindowResize)
      }
    }
  },
  pageLifetimes: {
    show() {
      this.setData({ selected: currentTabIndex() })
    }
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = tabs[index]
      if (!tab || index === this.data.selected) return
      this.setData({ selected: index })
      wx.switchTab({ url: `/${tab.pagePath}` })
    }
  }
})
