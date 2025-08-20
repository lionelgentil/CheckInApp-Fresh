# Photos Directory

This directory contains member photos and default avatars for the CheckIn App.

## Structure
- `members/` - Individual member photos (JPEG, PNG, WebP)
- `defaults/` - Default avatar files (SVG)

## File Naming
- Member photos: `{member-uuid}.{ext}` (e.g., `123e4567-e89b-12d3-a456-426614174000.jpg`)
- Default avatars: `male.svg`, `female.svg`

## Security
- Only JPEG, PNG, WebP, and SVG files allowed
- Maximum file size: 2MB
- Files served through API with proper validation

## Usage
- Photos are referenced in the database by filename only
- Served via `/api/photos/{filename}` endpoint
- Automatic fallback to gender-appropriate default if no custom photo