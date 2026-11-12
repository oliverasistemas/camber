import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import App from './App.jsx'

const theme = {
  token: {
    colorPrimary: '#2a78d6',
    colorBgLayout: '#f5f6f8',
    borderRadius: 8,
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: { headerBg: '#fff', headerHeight: 56, headerPadding: '0 24px', siderBg: '#fff' },
    Menu: { itemBorderRadius: 6, itemMarginInline: 8, activeBarBorderWidth: 0 },
    Card: { headerFontSize: 14 },
  },
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConfigProvider theme={theme}>
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
