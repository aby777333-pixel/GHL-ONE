-- Phase 4 wave 1: enum extensions (must precede their use).
alter type presence_status add value if not exists 'focus';
alter type presence_status add value if not exists 'break';
alter type presence_status add value if not exists 'lunch';
alter type presence_status add value if not exists 'field';
alter type presence_status add value if not exists 'remote';
alter type presence_status add value if not exists 'on_call';
alter type channel_type add value if not exists 'temporary';
alter type channel_type add value if not exists 'client';
alter type channel_type add value if not exists 'vendor';
alter type channel_type add value if not exists 'social';
alter type channel_type add value if not exists 'emergency';
alter type channel_type add value if not exists 'management';
alter type channel_type add value if not exists 'team';
alter type channel_type add value if not exists 'help';
alter type notification_kind add value if not exists 'help_request';
alter type notification_kind add value if not exists 'security';
