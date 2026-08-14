import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jvkgcuybsvfuqunvfkcu.supabase.co';
const supabasePublishableKey = "sb_publishable_2gb6ukUcdwdWuDCFFWx87g_PXaE38e4"

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
