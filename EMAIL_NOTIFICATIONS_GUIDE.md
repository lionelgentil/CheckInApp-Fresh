# Email Notification Control for Team Manager Updates

## 🎯 **Purpose**
This feature allows you to control whether email notifications are sent when team managers are added, updated, or removed from teams. This is particularly useful when doing bulk manager updates where you don't want to spam recipients with multiple emails.

## 🚀 **How to Use**

### **To Disable Email Notifications:**
Set the Railway environment variable:
```
ENABLE_EMAIL_NOTIFICATIONS=false
```

### **To Enable Email Notifications (Default):**
Set the Railway environment variable:
```
ENABLE_EMAIL_NOTIFICATIONS=true
```

Or simply remove/unset the variable (enabled by default).

## 🔧 **Railway Configuration**

### **Via Railway Dashboard:**
1. Go to your Railway project
2. Navigate to **Variables** tab
3. Add new variable:
   - **Name**: `ENABLE_EMAIL_NOTIFICATIONS`
   - **Value**: `false` (to disable) or `true` (to enable)
4. Deploy changes

### **Via Railway CLI:**
```bash
# Disable notifications
railway variables set ENABLE_EMAIL_NOTIFICATIONS=false

# Enable notifications
railway variables set ENABLE_EMAIL_NOTIFICATIONS=true

# Remove variable (enables by default)
railway variables delete ENABLE_EMAIL_NOTIFICATIONS
```

## 📊 **Visual Indicators**

The Team Manager Portal now displays the current email notification status in the header:

- **🟢 "Email Notifications: Enabled"** - Notifications will be sent
- **🟠 "Email Notifications: Disabled"** - Notifications are suppressed
- **⚪ "Email Notifications: Unknown"** - Status could not be determined

## 🎛️ **Accepted Values**

### **To DISABLE notifications:**
- `false`
- `0`
- `no`
- `disabled`
- `off`

### **To ENABLE notifications:**
- `true`
- `1`
- `yes`
- `enabled`
- `on`
- **(any other value or unset)**

## 🔍 **How It Works**

1. **API Level**: The `sendManagerNotification()` function checks the environment variable before sending emails
2. **Visual Feedback**: The manager interface shows the current status via the `/api/email-notifications-status` endpoint
3. **Logging**: When notifications are disabled, it logs the action instead of sending emails
4. **Safe Default**: If the variable is not set, notifications are **enabled** by default

## 📝 **Example Workflow**

### **For Bulk Updates:**
1. Set `ENABLE_EMAIL_NOTIFICATIONS=false` in Railway
2. Add managers to all teams via the interface
3. Set `ENABLE_EMAIL_NOTIFICATIONS=true` when done
4. Future manager changes will send notifications normally

### **For Production Use:**
- Keep `ENABLE_EMAIL_NOTIFICATIONS=true` or unset (default)
- Manager changes will notify relevant stakeholders

## 🛡️ **Security Notes**

- The status check endpoint requires authentication
- Only authenticated admin users can check notification status
- Environment variable changes require Railway deployment
- All manager operations are still logged regardless of notification setting

## 🔧 **Technical Details**

### **Modified Functions:**
- `sendManagerNotification()` - Now checks environment variable
- `checkEmailNotificationStatus()` - New API endpoint
- Manager interface - Visual status indicator

### **Files Changed:**
- `api.php` - Email notification logic
- `manager.html` - Status display and checking

### **API Endpoints:**
- `GET /api/email-notifications-status` - Check current status (requires auth)

This feature gives you complete control over email notifications for manager updates while maintaining all other functionality! 🎉