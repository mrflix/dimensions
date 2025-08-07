Dimensions
==========

A browser extension for coders to measure screen dimensions.
Download from the [Product Website](http://felixniklas.com/dimensions/), the [Chrome Webstore](https://chrome.google.com/webstore/detail/dimensions/baocaagndhipibgklemoalmkljaimfdj) or [Firefox Addons](https://addons.mozilla.org/en-US/firefox/addon/dimensions_extension/).

![Dimensions screenshot](/_sources/screenshot.png?raw=true)

Change Log
==========

## Version 3.0.0 (2025-08-07)

**Major Update - Manifest V3 Migration:**

- **CRITICAL**: Updated Chrome extension to Manifest V3 for Chrome 139+ compatibility
- Migrated from background scripts to service worker architecture
- Replaced external worker with inline worker code to comply with Chrome security policies
- Updated permissions structure with separate `host_permissions`
- Enhanced error handling for screenshot capture and worker communication
- Improved memory management with proper cleanup of blob URLs and worker instances
- All existing functionality preserved (Alt+D activation, hover measurements, Alt+click area measurement, ESC to close)

**Breaking Changes:**
- Minimum Chrome version requirement: 88+ (Manifest V3 support)
- Legacy Manifest V2 browsers no longer supported

## Version 2.0.5 (2016-10-23)

- make sure that the text direction stays left-to-right [\#30](https://github.com/mrflix/dimensions/issues/30)

## Version 2 (2015-07-14)

**Implemented enhancements:**

- measure an area (press ALT) [\#14](https://github.com/mrflix/dimensions/issues/14)
- adjust dimensions color depending on the background [\#20](https://github.com/mrflix/dimensions/issues/20)
- climb up gradients [\#3](https://github.com/mrflix/dimensions/issues/3)
- hide cursor [\#16](https://github.com/mrflix/dimensions/issues/16)

**Fixed bugs:**

- fix measuring on Mac Retina [\#8](https://github.com/mrflix/dimensions/issues/8)
- fix a bug that breaks dimensions [\#22](https://github.com/mrflix/dimensions/issues/22)

## Version 1 (2014-9-10)
