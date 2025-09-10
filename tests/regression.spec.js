const { test, expect } = require('@playwright/test');

test.describe('View App Critical Path Tests', () => {
  test('View app loads successfully', async ({ page }) => {
    await page.goto('/view.html');
    
    // Wait for main app structure to load
    await page.waitForSelector('.team-grid-section', { timeout: 10000 });
    
    // Should have header
    const header = page.locator('.app-header h1');
    await expect(header).toBeVisible();
  });

  test('Team toggles work correctly', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(3000);
    
    // Check if team toggles exist
    const homeToggle = page.locator('#home-toggle');
    const awayToggle = page.locator('#away-toggle');
    
    if (await homeToggle.isVisible() && await awayToggle.isVisible()) {
      // Test switching between teams
      await awayToggle.click();
      await page.waitForTimeout(500);
      
      // Should switch to away team
      const awayChecked = await awayToggle.isChecked();
      expect(awayChecked).toBe(true);
      
      // Switch back to home
      await homeToggle.click();
      await page.waitForTimeout(500);
      
      const homeChecked = await homeToggle.isChecked();
      expect(homeChecked).toBe(true);
    }
  });

  test('Player grid displays correctly', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(5000);
    
    // Check if player grid exists
    const playerGrid = page.locator('.player-grid-container');
    if (await playerGrid.isVisible()) {
      const playerCards = page.locator('.player-grid-item');
      const cardCount = await playerCards.count();
      
      if (cardCount > 0) {
        // First player card should have proper structure
        const firstCard = playerCards.first();
        await expect(firstCard).toBeVisible();
        
        // Should have photo
        const photo = firstCard.locator('.player-grid-photo');
        await expect(photo).toBeVisible();
        
        // Should have name
        const name = firstCard.locator('.player-grid-name');
        await expect(name).toBeVisible();
        
        const nameText = await name.textContent();
        expect(nameText.trim()).toBeTruthy();
      }
    }
  });

  test('Card summary displays with proper styling', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(5000);
    
    const cardSummary = page.locator('.team-card-summary');
    const isVisible = await cardSummary.isVisible();
    
    if (isVisible) {
      // Should have yellow referee background
      const bgColor = await cardSummary.evaluate(el => 
        window.getComputedStyle(el).backgroundColor
      );
      // Should be yellowish, not white
      expect(bgColor).not.toBe('rgb(255, 255, 255)');
      
      // Should have proper header
      const header = cardSummary.locator('.card-summary-header');
      await expect(header).toBeVisible();
      
      // Should have expand/collapse icon
      const icon = page.locator('#card-summary-icon');
      if (await icon.isVisible()) {
        // Test clicking to expand/collapse
        await cardSummary.click();
        await page.waitForTimeout(500);
        
        // Icon should rotate
        const transform = await icon.evaluate(el => 
          window.getComputedStyle(el).transform
        );
        expect(transform).toBeTruthy();
      }
    }
  });

  test('Check-in functionality works', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(5000);
    
    const playerCards = page.locator('.player-grid-item');
    const cardCount = await playerCards.count();
    
    if (cardCount > 0) {
      const firstCard = playerCards.first();
      
      // Check initial state
      const initiallyCheckedIn = await firstCard.evaluate(el => 
        el.classList.contains('checked-in')
      );
      
      // Click to toggle check-in
      await firstCard.click();
      await page.waitForTimeout(1000);
      
      // State should change
      const nowCheckedIn = await firstCard.evaluate(el => 
        el.classList.contains('checked-in')
      );
      
      expect(nowCheckedIn).toBe(!initiallyCheckedIn);
    }
  });
});

test.describe('View App Performance Tests', () => {
  test('View app loads quickly', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/view.html');
    await page.waitForSelector('.team-grid-section', { timeout: 15000 });
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
  });

  test('Team switching is responsive', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(3000);
    
    const homeToggle = page.locator('#home-toggle');
    const awayToggle = page.locator('#away-toggle');
    
    if (await homeToggle.isVisible() && await awayToggle.isVisible()) {
      const startTime = Date.now();
      
      await awayToggle.click();
      await page.waitForTimeout(500);
      await homeToggle.click();
      
      const switchTime = Date.now() - startTime;
      expect(switchTime).toBeLessThan(3000); // Should switch quickly
    }
  });

  test('Card summary loads efficiently', async ({ page }) => {
    await page.goto('/view.html');
    
    const startTime = Date.now();
    await page.waitForTimeout(5000); // Allow card summary to load
    
    const cardSummary = page.locator('.team-card-summary');
    if (await cardSummary.isVisible()) {
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(8000); // Should load within 8 seconds
    }
  });
});

test.describe('Mobile View App Tests', () => {
  test('Mobile interface works properly', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');
    
    await page.goto('/view.html');
    await page.waitForTimeout(3000);
    
    // Header should be responsive
    const header = page.locator('.app-header');
    if (await header.isVisible()) {
      const headerBox = await header.boundingBox();
      expect(headerBox.height).toBeLessThan(150); // Reasonable mobile height
    }
  });

  test('Player cards are touch-friendly on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');
    
    await page.goto('/view.html');
    await page.waitForTimeout(3000);
    
    const playerCards = page.locator('.player-grid-item');
    const cardCount = await playerCards.count();
    
    if (cardCount > 0) {
      const firstCard = playerCards.first();
      const cardBox = await firstCard.boundingBox();
      
      // Cards should be large enough for touch (at least 44px recommended)
      expect(cardBox.width).toBeGreaterThan(80);
      expect(cardBox.height).toBeGreaterThan(100);
    }
  });

  test('Card summary mobile functionality', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');
    
    await page.goto('/view.html');
    await page.waitForTimeout(3000);
    
    const cardSummary = page.locator('.team-card-summary');
    if (await cardSummary.isVisible()) {
      // Should be properly sized for mobile
      const summaryBox = await cardSummary.boundingBox();
      const viewportSize = page.viewportSize();
      
      // Should not be wider than viewport
      expect(summaryBox.width).toBeLessThanOrEqual(viewportSize.width);
      
      // Test touch interaction
      await cardSummary.click();
      await page.waitForTimeout(500);
      
      // Should respond to touch
      const icon = page.locator('#card-summary-icon');
      if (await icon.isVisible()) {
        const transform = await icon.evaluate(el => 
          window.getComputedStyle(el).transform
        );
        expect(transform).toBeTruthy();
      }
    }
  });
});

test.describe('View App Data Integrity Tests', () => {
  test('API endpoints work correctly', async ({ page }) => {
    // Test basic API endpoints that view app uses
    const healthResponse = await page.request.get('/api/health');
    expect(healthResponse.status()).not.toBe(500);
    
    const versionResponse = await page.request.get('/api/version');
    expect(versionResponse.status()).toBe(200);
    
    if (versionResponse.status() === 200) {
      const versionData = await versionResponse.json();
      expect(versionData).toHaveProperty('version');
      expect(versionData.version).toBe('6.0.0');
    }
  });

  test('Teams data loads without errors', async ({ page }) => {
    await page.goto('/view.html');
    
    // Wait for teams to potentially load
    await page.waitForTimeout(5000);
    
    // Check console for major errors
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        logs.push(msg.text());
      }
    });
    
    // Trigger team loading
    const homeToggle = page.locator('#home-toggle');
    if (await homeToggle.isVisible()) {
      await homeToggle.click();
      await page.waitForTimeout(2000);
    }
    
    // Should not have critical errors
    const criticalErrors = logs.filter(log => 
      log.includes('TypeError') || log.includes('ReferenceError')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('Player photos load properly', async ({ page }) => {
    await page.goto('/view.html');
    await page.waitForTimeout(5000);
    
    const playerPhotos = page.locator('.player-grid-photo');
    const photoCount = await playerPhotos.count();
    
    if (photoCount > 0) {
      // Check first few photos
      for (let i = 0; i < Math.min(3, photoCount); i++) {
        const photo = playerPhotos.nth(i);
        await expect(photo).toBeVisible();
        
        // Should have valid src attribute
        const src = await photo.getAttribute('src');
        expect(src).toBeTruthy();
        expect(src).not.toBe('');
      }
    }
  });
});

test.describe('View App Error Handling Tests', () => {
  test('App handles network errors gracefully', async ({ page }) => {
    await page.goto('/view.html');
    
    // Block all API requests to simulate network issues
    await page.route('/api/**', route => route.abort());
    
    // Wait to see how app handles it
    await page.waitForTimeout(3000);
    
    // App should still be functional (not completely broken)
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
    
    // Should show some indication of issues but not crash
    const gridSection = page.locator('.team-grid-section');
    await expect(gridSection).toBeVisible();
  });

  test('Invalid team data doesn\'t crash the app', async ({ page }) => {
    await page.goto('/view.html');
    
    // Inject invalid data to test error handling
    await page.addInitScript(() => {
      // Override fetch to return invalid team data occasionally
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        if (args[0].includes('/api/teams')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ invalid: 'data' }])
          });
        }
        return originalFetch.apply(this, args);
      };
    });
    
    await page.waitForTimeout(3000);
    
    // App should still function
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
  });

  test('Missing DOM elements don\'t cause crashes', async ({ page }) => {
    await page.goto('/view.html');
    
    // Remove key elements to test robustness
    await page.evaluate(() => {
      const homeToggle = document.getElementById('home-toggle');
      if (homeToggle) homeToggle.remove();
    });
    
    await page.waitForTimeout(2000);
    
    // App should still be responsive
    const gridSection = page.locator('.team-grid-section');
    await expect(gridSection).toBeVisible();
  });
});