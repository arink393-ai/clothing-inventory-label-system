-- 使用者只能修改自己的顯示名稱。
create policy "update own profile"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());
