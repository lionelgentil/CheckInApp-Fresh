// CheckIn App Configuration
// This file contains configuration data that can be easily modified without touching the main application code

// App version constant - centralized location for version management
const APP_VERSION = '6.3.0';

window.CheckInAppConfig = {
    // Card reasons for yellow and red cards
    cardReasons: [
        "Unsporting behavior",
        "Dissent by word or action", 
        "Persistent infringement",
        "Delaying the restart of play",
        "Failure to respect distance",
        "Entering/leaving without permission",
        "Sliding",
        "Reckless/aggressive challenge",
        "Stopping a promising attack",
        "Serious foul play",
        "Violent conduct",
        "Spitting",
        "Denial of a goal scoring opportunity",
        "Offensive/insulting language",
        "Second yellow card"
    ],
    
    // Future config items can go here
    // maxPlayersPerTeam: 25,
    // defaultMatchDuration: 90,
    // etc.
};
