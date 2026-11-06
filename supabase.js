import { createClient } from
'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://pwwrtuwjwzkoyxdcejrw.supabase.co';

const SUPABASE_KEY = 'sb_publishable_6nPBQ6vc0c7RtZYefa4Ajw_EvlxSJLX';

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);