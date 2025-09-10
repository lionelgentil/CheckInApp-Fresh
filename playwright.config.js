  module.exports = {
    testDir: './tests',
    timeout: 30000,
    use: {
      baseURL: 'https://checkinapp-fresh-production.up.railway.app',
      screenshot: 'only-on-failure',
      video: 'retain-on-failure',
      trace: 'retain-on-failure'
    },
    projects: [
      {
        name: 'desktop',
        use: {
          viewport: { width: 1280, height: 720 },
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        }
      },
      {
        name: 'mobile',
        use: {
          viewport: { width: 375, height: 812 },
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15',
          isMobile: true,
          hasTouch: true
        }
      }
    ],
    reporter: [['html'], ['list']]
  };

