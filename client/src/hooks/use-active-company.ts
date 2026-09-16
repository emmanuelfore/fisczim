import { useState, useEffect, useRef } from "react";
import { useCompanies } from "./use-companies";
import { useAuth } from "./use-auth";

export function useActiveCompany(
    enabled: boolean = true,
    userScopeKey: string | number | null = null
) {
    // Most consumers do not pass a scope explicitly. Scope the company query
    // to the signed-in user so a previous user's cached memberships can never
    // become the active company for this session.
    const { user } = useAuth();
    const resolvedUserScopeKey = userScopeKey ?? user?.id ?? null;
    const { data: companies, isLoading, refetch } = useCompanies(enabled, resolvedUserScopeKey);
    const [activeCompanyId, setActiveCompanyId] = useState<number | null>(() => {
        const stored = localStorage.getItem("selectedCompanyId");
        return stored ? parseInt(stored) : null;
    });
    // Use a ref to read activeCompanyId inside the effect without adding it to deps
    const activeCompanyIdRef = useRef(activeCompanyId);
    activeCompanyIdRef.current = activeCompanyId;

    useEffect(() => {
        if (!isLoading && companies && companies.length > 0) {
            const storedCompany = companies.find(c => c.id === activeCompanyIdRef.current);

            if (!storedCompany) {
                const bestCompany =
                    companies.find(c => c.role === "owner") ||
                    companies.find(c => c.role === "cashier") ||
                    companies[0];

                const finalId = bestCompany.id;
                setActiveCompanyId(finalId);
                localStorage.setItem("selectedCompanyId", finalId.toString());
            }
        } else if (!isLoading && companies && companies.length === 0) {
            if (activeCompanyIdRef.current !== null) {
                setActiveCompanyId(null);
                localStorage.removeItem("selectedCompanyId");
            }
        }
    }, [companies, isLoading]); // removed activeCompanyId — read via ref to avoid loop

    useEffect(() => {
        const handleAccessDenied = () => {
            // The selection was already cleared by apiFetch. Clearing local
            // state immediately prevents any more requests for that company;
            // refetching removes stale memberships from the React Query cache.
            setActiveCompanyId(null);
            void refetch();
        };
        window.addEventListener("company-access-denied", handleAccessDenied);
        return () => window.removeEventListener("company-access-denied", handleAccessDenied);
    }, [refetch]);

    const setCompany = (id: number) => {
        setActiveCompanyId(id);
        localStorage.setItem("selectedCompanyId", id.toString());
        // Trigger a page reload to ensure all queries are refreshed with new company context
        window.location.reload();
    };

    const activeCompany = companies?.find(c => c.id === activeCompanyId) || companies?.[0];

    return {
        activeCompany,
        activeCompanyId: activeCompany?.id || null,
        setCompany,
        isLoading: enabled ? isLoading : false
    };
}
