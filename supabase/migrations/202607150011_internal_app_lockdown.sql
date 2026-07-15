-- 門市已完成初始化：正式內部版不再允許一般登入者建立新的門市。
revoke all on function public.bootstrap_store(text,text) from public;
revoke all on function public.bootstrap_store(text,text) from anon;
revoke all on function public.bootstrap_store(text,text) from authenticated;
