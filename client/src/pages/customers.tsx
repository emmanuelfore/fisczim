import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useState } from "react";
import { downloadExcel } from "@/lib/export-utils";

import { useCustomers, useUpdateCustomer } from "@/hooks/use-customers";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Building2,
  Phone,
  Mail,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileDown,
  Pencil,
  FileText,
} from "lucide-react";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { DeleteButton } from "@/components/delete-button";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";

export default function CustomersPage() {
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const companyId = parseInt(localStorage.getItem("selectedCompanyId") || "0");
  const { data: customers, isLoading } = useCustomers(companyId);
  const updateCustomer = useUpdateCustomer();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  // Filter logic
  const filteredCustomers = customers?.filter((c) => {
    // 1. Search Term
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (c.phone && c.phone.includes(searchTerm)) ||
      (c.customerType &&
        c.customerType.toLowerCase().includes(searchTerm.toLowerCase()));

    // 2. Status Filter
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? c.isActive
          : statusFilter === "inactive"
            ? !c.isActive
            : true;

    // 3. Type Filter
    const matchesType =
      typeFilter === "all" ? true : c.customerType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  // Pagination logic
  const totalPages = Math.ceil((filteredCustomers?.length || 0) / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers?.slice(
    startIndex,
    startIndex + itemsPerPage,
  );

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  return (
    <Layout>
      <PageHeader
        title="Customers"
        subtitle="Manage your client base"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                downloadExcel(`/api/export/customers?companyId=${companyId}`, `customers_export_${new Date().toISOString().split("T")[0]}.csv`);
              }}
              disabled={!companyId}
              className="rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border-slate-200"
            >
              <FileDown className="w-4 h-4 mr-2 text-violet-600" />
              Export CSV
            </Button>
            <CsvImportDialog
              type="customer"
              companyId={companyId}
              onSuccess={() => {
                queryClient.invalidateQueries({
                  queryKey: ["customers", companyId],
                });
              }}
            />
            {companyId > 0 ? (
              <CreateCustomerDialog companyId={companyId} />
            ) : (
              <Button
                disabled
                variant="outline"
                className="flex-1 sm:flex-none"
              >
                Select a Company First
              </Button>
            )}
          </>
        }
      />

      <div className="admin-panel mb-4 flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="relative flex-1 w-full sm:max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B] transition-colors duration-200" />
          <Input
            placeholder="Search customers, email, phone..."
            className="pl-9"
            value={searchTerm}
            onChange={handleSearch}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Customer Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="business">Business</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(searchTerm || statusFilter !== "all" || typeFilter !== "all") && (
          <Button
            variant="ghost"
            onClick={() => {
              setSearchTerm("");
              setStatusFilter("all");
              setTypeFilter("all");
              setCurrentPage(1);
            }}
            className="text-[#64748B]"
          >
            Reset
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px] md:min-w-full">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB] text-[12px] uppercase tracking-wide font-semibold text-[#64748B]">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="hidden md:table-cell px-5 py-3 font-semibold">
                  Contact
                </th>
                <th className="hidden lg:table-cell px-5 py-3 font-semibold">
                  Tax Details
                </th>
                <th className="hidden sm:table-cell px-5 py-3 font-semibold">
                  Type
                </th>
                <th className="hidden sm:table-cell px-5 py-3 font-semibold text-right">
                  Balance
                </th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : paginatedCustomers?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="bg-slate-50 p-4 rounded-full mb-4">
                        <Users className="w-8 h-8 text-slate-300" />
                      </div>
                      <p className="text-lg font-medium text-slate-900 mb-1">
                        No customers found
                      </p>
                      <p className=" text-slate-500">
                        Try adjusting your search or filters.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers?.map((c) => (
                  <tr
                    key={c.id}
                    className={`group hover:bg-[#F8FAFC] transition-colors duration-150 ${!c.isActive ? "opacity-60 bg-slate-50/30" : ""}`}
                  >
                    <td className="px-5 py-4 align-middle">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-[10px] flex items-center justify-center text-xs font-bold ${c.isActive ? "bg-[#EFF6FF] text-[#2563EB]" : "bg-slate-100 text-slate-500"}`}
                        >
                          {c.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <Link href={`/customers/${c.id}`}>
                            <span className="font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors cursor-pointer ">
                              {c.name}
                            </span>
                          </Link>
                          {!c.isActive && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                                Inactive
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-5 py-4 align-middle">
                      <div className="flex flex-col gap-1 text-xs">
                        {c.email && (
                          <div className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900 transition-colors">
                            <Mail className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">{c.email}</span>
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900 transition-colors">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate">{c.phone}</span>
                          </div>
                        )}
                        {!c.email && !c.phone && (
                          <span className="text-slate-400 text-xs italic">
                            No contact info
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-5 py-4 align-middle">
                      <div className="text-xs text-slate-600 space-y-1">
                        {c.tin && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">
                              TIN
                            </span>
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-700">
                              {c.tin}
                            </span>
                          </div>
                        )}
                        {c.vatNumber && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider w-8">
                              VAT
                            </span>
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-700">
                              {c.vatNumber}
                            </span>
                          </div>
                        )}
                        {!c.tin && !c.vatNumber && (
                          <span className="text-slate-400 italic text-xs">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 align-middle">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border shadow-sm ${
                          c.customerType === "business"
                            ? "bg-blue-50 text-blue-700 border-blue-100"
                            : "bg-emerald-50 text-emerald-700 border-emerald-100"
                        }`}
                      >
                        {c.customerType === "business" ? (
                          <Building2 className="w-3 h-3 mr-1.5" />
                        ) : (
                          <Users className="w-3 h-3 mr-1.5" />
                        )}
                        {c.customerType}
                      </span>
                    </td>
                    <td className="hidden sm:table-cell px-5 py-4 align-middle text-right">
                      <span className={`font-bold font-mono ${Number((c as any).openingBalance) > 0 ? "text-red-600" : "text-slate-600"}`}>
                        ${Number((c as any).openingBalance || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right align-middle">
                      <div className="flex justify-end items-center gap-1">
                        <Link href={`/customer-statements?customerId=${c.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-[9px] text-slate-500 hover:text-[#2563EB] hover:bg-blue-50 transition-all"
                            title="View Statement"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <EditCustomerDialog
                          customer={c}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-[9px] text-slate-500 hover:bg-blue-50 hover:text-[#2563EB]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <DeleteButton
                          title="Delete Customer"
                          description={`Are you sure you want to delete ${c.name}? This will mark them as inactive.`}
                          onConfirm={async () => {
                            await updateCustomer.mutateAsync({
                              id: c.id,
                              data: { isActive: false },
                            });
                          }}
                          isDeleting={updateCustomer.isPending}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-[9px] text-red-500 hover:bg-red-50 hover:text-red-600"
                            >
                              <span className="sr-only">Delete customer</span>
                              <svg
                                className="h-3.5 w-3.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                              </svg>
                            </Button>
                          }
                        />
                        <Link href={`/customers/${c.id}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-[9px] text-slate-500 hover:text-[#2563EB] hover:bg-blue-50 transition-all"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-4 border-t border-[#E5E7EB] bg-white gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-400">
                Items per page
              </span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(v) => {
                  setItemsPerPage(parseInt(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[70px] h-8 text-xs bg-white border-slate-200 shadow-sm rounded-lg font-bold">
                  <SelectValue placeholder="10" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
              {filteredCustomers && (
                <span className="text-xs text-slate-400 ml-2">
                  Showing {startIndex + 1}–
                  {Math.min(
                    startIndex + itemsPerPage,
                    filteredCustomers.length,
                  )}{" "}
                  of {filteredCustomers.length}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-400 font-medium mr-2">
                Page {currentPage} of {totalPages || 1}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded-xl border-slate-200 shadow-sm hover:bg-white hover:text-primary transition-all disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={currentPage >= totalPages}
                className="rounded-xl border-slate-200 shadow-sm hover:bg-white hover:text-primary transition-all disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </Layout>
  );
}
