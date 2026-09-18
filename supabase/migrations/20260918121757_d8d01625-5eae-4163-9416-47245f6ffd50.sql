-- roles
CREATE TYPE public.app_role AS ENUM ('hr_admin', 'manager', 'employee');
CREATE TYPE public.review_status AS ENUM ('draft', 'submitted');
CREATE TYPE public.cycle_status AS ENUM ('open', 'closed');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  job_title TEXT,
  department TEXT,
  manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  status public.cycle_status NOT NULL DEFAULT 'open',
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, quarter)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_cycles TO authenticated;
GRANT ALL ON public.review_cycles TO service_role;
ALTER TABLE public.review_cycles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.review_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.review_status NOT NULL DEFAULT 'draft',
  overall_score NUMERIC(3,2),
  summary TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, employee_id, reviewer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.review_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.reviews(id) ON DELETE CASCADE,
  competency TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (review_id, competency)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_scores TO authenticated;
GRANT ALL ON public.review_scores TO service_role;
ALTER TABLE public.review_scores ENABLE ROW LEVEL SECURITY;

-- policies: profiles
CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_hr_manage" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

-- policies: user_roles
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'hr_admin'));

-- policies: cycles
CREATE POLICY "cycles_select_authenticated" ON public.review_cycles FOR SELECT TO authenticated USING (true);
CREATE POLICY "cycles_hr_manage" ON public.review_cycles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (public.has_role(auth.uid(), 'hr_admin'));

-- policies: reviews
CREATE POLICY "reviews_select_involved" ON public.reviews FOR SELECT TO authenticated USING (
  reviewer_id = auth.uid()
  OR (employee_id = auth.uid() AND status = 'submitted')
  OR public.has_role(auth.uid(), 'hr_admin')
);
CREATE POLICY "reviews_insert_reviewer" ON public.reviews FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'hr_admin'));
CREATE POLICY "reviews_update_reviewer" ON public.reviews FOR UPDATE TO authenticated USING (reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'hr_admin')) WITH CHECK (reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'hr_admin'));
CREATE POLICY "reviews_delete_reviewer" ON public.reviews FOR DELETE TO authenticated USING ((reviewer_id = auth.uid() AND status = 'draft') OR public.has_role(auth.uid(), 'hr_admin'));

-- policies: review_scores
CREATE POLICY "scores_select_involved" ON public.review_scores FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND (
    r.reviewer_id = auth.uid() OR (r.employee_id = auth.uid() AND r.status = 'submitted') OR public.has_role(auth.uid(), 'hr_admin')))
);
CREATE POLICY "scores_write_reviewer" ON public.review_scores FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND (r.reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'hr_admin')))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.reviews r WHERE r.id = review_id AND (r.reviewer_id = auth.uid() OR public.has_role(auth.uid(), 'hr_admin')))
);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER reviews_updated_at BEFORE UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- new user -> profile + default role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'employee') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- seed quarterly cycles for 2026
INSERT INTO public.review_cycles (name, year, quarter, status, starts_on, ends_on) VALUES
  ('2026 Q1', 2026, 1, 'closed', '2026-01-01', '2026-03-31'),
  ('2026 Q2', 2026, 2, 'closed', '2026-04-01', '2026-06-30'),
  ('2026 Q3', 2026, 3, 'open', '2026-07-01', '2026-09-30'),
  ('2026 Q4', 2026, 4, 'open', '2026-10-01', '2026-12-31');
