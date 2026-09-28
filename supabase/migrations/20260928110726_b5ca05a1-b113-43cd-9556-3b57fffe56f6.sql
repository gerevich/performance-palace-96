DROP POLICY profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_self_hr ON public.profiles
FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'hr_admin'));

CREATE OR REPLACE VIEW public.profiles_directory AS
  SELECT id, full_name, job_title, department, manager_id
  FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;

DROP POLICY cycles_select_authenticated ON public.review_cycles;

CREATE POLICY cycles_select_scoped ON public.review_cycles
FOR SELECT TO authenticated
USING (
  status = 'open'
  OR public.has_role(auth.uid(), 'hr_admin')
  OR EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.cycle_id = id
      AND (r.reviewer_id = auth.uid() OR r.employee_id = auth.uid())
  )
);