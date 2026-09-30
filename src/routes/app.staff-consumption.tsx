import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, Chip, PageHeader, Stat } from "@/components/ui-kit";
import { canManageStaffConsumption, useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/date-time";
import { formatETB } from "@/lib/ethiopic";
import { useT } from "@/lib/i18n";
import { useLang } from "@/lib/lang-context";
import { EMPTY_MODULE_RECORDS, useModuleRecords } from "@/lib/module-records";
import {
  createStaffBreakageDocument,
  postStaffBreakageDocument,
  rejectStaffBreakageDocument,
  reverseStaffBreakageDocument,
  STAFF_BREAKAGE_REASONS,
  type StaffBreakageDocument,
} from "@/lib/staff-breakage";
import {
  buildStaffDirectory,
  type StaffMemberOnly,
  type StaffMemberView,
  type StaffScheduleRecord,
} from "@/lib/staff-management";
import {
  defaultStaffConsumptionQuantityForMenuItem,
  buildStaffConsumptionLines,
  buildStaffConsumptionReport,
  buildStaffConsumptionStationOrder,
  createStaffConsumptionDocument,
  defaultServingVariantsForMenuItem,
  postStaffConsumptionDocument,
  quantityStepForMenuItem,
  rejectStaffConsumptionDocument,
  reverseStaffConsumptionDocument,
  STAFF_CONSUMPTION_STATIONS,
  STAFF_CONSUMPTION_TYPES,
  stationToDeductionLocation,
  todayStaffConsumptionTotals,
  type StaffConsumptionDocument,
  type StaffConsumptionStation,
  type StaffConsumptionType,
} from "@/lib/staff-consumption";
import {
  STOCK_LOCATIONS,
  useStockManagementModule,
  type OperationalStockLocation,
  type StockLocation,
} from "@/lib/stock-management";
import { showError, showSuccess } from "@/lib/toast";
import { useStore } from "@/lib/store";
import {
  StationTicketPreviewDialog,
  type StationTicketPreviewView,
} from "@/components/station-ticket-preview";

export const Route = createFileRoute("/app/staff-consumption")({ component: StaffConsumptionPage });

type PageTab = "record" | "breakage" | "history" | "reports";

function statusTone(status: string): "ember" | "teff" | "destructive" | "muted" {
  if (status === "Submitted") return "ember";
  if (status === "Posted") return "teff";
  if (status === "Rejected" || status === "Reversed") return "destructive";
  return "muted";
}

function resolveSelfStaffMember(
  user: { id: string; name: string; role: string; branch: string },
  directory: StaffMemberView[],
): StaffMemberView {
  const byId = directory.find((member) => member.id === user.id);
  if (byId) return byId;
  const name = user.name.trim().toLowerCase();
  const byName = directory.find((member) => member.name.trim().toLowerCase() === name);
  if (byName) return byName;
  return {
    id: user.id,
    name: user.name,
    avatar: user.name.slice(0, 2).toUpperCase(),
    role: user.role,
    branch: user.branch,
    phone: "",
    shift: "",
    startTime: "",
    endTime: "",
    daysWorked: 0,
    status: "Off",
    attendanceStatus: "Not Scheduled",
    scheduledToday: false,
    jobTitle: user.role,
    department: user.role,
    station: "",
    inventoryLocation: "",
    employeeId: user.id,
    username: "",
    employmentStatus: "Active",
    accountStatus: "Active",
    hasLoginAccount: true,
    workingDays: [],
  };
}

type DraftLine = {
  menuItemId: string;
  quantity: string;
  unitLabel: string;
  station: StaffConsumptionStation;
  stockDeductionLocation: OperationalStockLocation;
  notes: string;
};

const ALL_FILTER = "__all__";

function mapMenuStationToConsumptionStation(station: string): StaffConsumptionStation {
  const key = station.trim().toLowerCase();
  if (key.includes("vip")) return "VIP Bar";
  if (key.includes("bar") || key.includes("beverage")) return "Main Bar";
  if (key.includes("butcher") || key.includes("siga")) return "Butcher House";
  if (key.includes("coffee") || key.includes("buna")) return "Coffee House";
  if (key.includes("kitchen")) return "Kitchen";
  return "Kitchen";
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 w-full min-w-0 ${className}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

function StaffConsumptionPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const t = useT();
  const lang = useLang();
  const store = useStore();
  const stockModule = useStockManagementModule();
  const user = auth.user;

  const { records: scheduleMetadata } = useModuleRecords<StaffScheduleRecord>("staff", EMPTY_MODULE_RECORDS);
  const { records: staffOnly } = useModuleRecords<StaffMemberOnly>("staff-members", EMPTY_MODULE_RECORDS);

  const [tab, setTab] = useState<PageTab>("record");
  const [staffMemberId, setStaffMemberId] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [consumptionType, setConsumptionType] = useState<StaffConsumptionType>("Meal");
  const [reason, setReason] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([
    {
      menuItemId: "",
      quantity: "1",
      unitLabel: "Plate",
      station: "Kitchen",
      stockDeductionLocation: "Kitchen",
      notes: "",
    },
  ]);
  const [viewDoc, setViewDoc] = useState<StaffConsumptionDocument | null>(null);
  const [viewBreakage, setViewBreakage] = useState<StaffBreakageDocument | null>(null);
  const [reverseDoc, setReverseDoc] = useState<StaffConsumptionDocument | null>(null);
  const [reverseBreakage, setReverseBreakage] = useState<StaffBreakageDocument | null>(null);
  const [rejectDoc, setRejectDoc] = useState<StaffConsumptionDocument | null>(null);
  const [rejectBreakage, setRejectBreakage] = useState<StaffBreakageDocument | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  const [breakageItemId, setBreakageItemId] = useState("");
  const [breakageQuantity, setBreakageQuantity] = useState("1");
  const [breakageLocation, setBreakageLocation] = useState<StockLocation>("Kitchen");
  const [breakageReason, setBreakageReason] = useState<(typeof STAFF_BREAKAGE_REASONS)[number]>("Broken glass");
  const [breakageNotes, setBreakageNotes] = useState("");
  const [chargeToStaff, setChargeToStaff] = useState(false);

  const [reportFrom, setReportFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportStaffId, setReportStaffId] = useState(ALL_FILTER);
  const [reportDepartment, setReportDepartment] = useState(ALL_FILTER);
  const [reportStation, setReportStation] = useState(ALL_FILTER);
  const [reportType, setReportType] = useState(ALL_FILTER);
  const [ticketPreview, setTicketPreview] = useState<StationTicketPreviewView | null>(null);

  useEffect(() => {
    if (!user) navigate({ to: "/login" });
  }, [user, navigate]);

  const isManager = canManageStaffConsumption(user?.role);

  const staffDirectory = useMemo(
    () =>
      buildStaffDirectory(auth.users, scheduleMetadata, staffOnly).filter(
        (member) => member.employmentStatus !== "Terminated",
      ),
    [auth.users, scheduleMetadata, staffOnly],
  );

  const selfStaff = useMemo(
    () => (user ? resolveSelfStaffMember(user, staffDirectory) : null),
    [user, staffDirectory],
  );

  useEffect(() => {
    if (!selfStaff) return;
    if (!isManager) {
      setStaffMemberId(selfStaff.id);
      return;
    }
    setStaffMemberId((current) => current || selfStaff.id);
  }, [isManager, selfStaff]);

  const selectedStaff = useMemo(() => {
    if (!isManager && selfStaff) return selfStaff;
    return staffDirectory.find((member) => member.id === staffMemberId) ?? (staffMemberId === selfStaff?.id ? selfStaff : undefined);
  }, [isManager, selfStaff, staffDirectory, staffMemberId]);

  const menuItems = useMemo(
    () => [...store.menuItems].sort((a, b) => a.name_en.localeCompare(b.name_en)),
    [store.menuItems],
  );

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    if (!q) return menuItems;
    return menuItems.filter(
      (item) =>
        item.name_en.toLowerCase().includes(q) ||
        item.name_am.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [menuItems, menuSearch]);

  const filteredMenuCategories = useMemo(
    () => Array.from(new Set(filteredMenuItems.map((item) => item.category))).sort(),
    [filteredMenuItems],
  );

  const departments = useMemo(
    () => Array.from(new Set(staffDirectory.map((member) => member.department).filter(Boolean))).sort(),
    [staffDirectory],
  );

  const todayTotals = useMemo(
    () => todayStaffConsumptionTotals(stockModule.staffConsumptions),
    [stockModule.staffConsumptions],
  );

  const visibleConsumptions = useMemo(() => {
    const rows = [...stockModule.staffConsumptions]
      .filter((doc) => !doc.reversalOf)
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    if (isManager) return rows;
    return rows.filter((doc) => doc.staffMemberId === selfStaff?.id || doc.submittedById === user?.id);
  }, [isManager, selfStaff?.id, stockModule.staffConsumptions, user?.id]);

  const visibleBreakages = useMemo(() => {
    const rows = [...stockModule.staffBreakages].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    if (isManager) return rows;
    return rows.filter((doc) => doc.staffMemberId === selfStaff?.id || doc.submittedById === user?.id);
  }, [isManager, selfStaff?.id, stockModule.staffBreakages, user?.id]);

  const pendingConsumptions = useMemo(
    () => visibleConsumptions.filter((doc) => doc.status === "Submitted"),
    [visibleConsumptions],
  );
  const pendingBreakages = useMemo(
    () => visibleBreakages.filter((doc) => doc.status === "Submitted"),
    [visibleBreakages],
  );
  const pendingCount = pendingConsumptions.length + pendingBreakages.length;

  const breakageItem = useMemo(
    () => stockModule.items.find((item) => item.id === breakageItemId),
    [breakageItemId, stockModule.items],
  );
  const breakageBalance = useMemo(
    () =>
      stockModule.balances.find(
        (row) => row.itemId === breakageItemId && row.location === breakageLocation,
      ),
    [breakageItemId, breakageLocation, stockModule.balances],
  );
  const breakageItems = useMemo(
    () => [...stockModule.items].sort((a, b) => a.name.localeCompare(b.name)),
    [stockModule.items],
  );

  const reportRows = useMemo(
    () =>
      buildStaffConsumptionReport({
        documents: stockModule.staffConsumptions,
        from: reportFrom,
        to: reportTo,
        staffMemberId: reportStaffId === ALL_FILTER ? undefined : reportStaffId,
        department: reportDepartment === ALL_FILTER ? undefined : reportDepartment,
        station: reportStation === ALL_FILTER ? "ALL" : (reportStation as StaffConsumptionStation),
        consumptionType: reportType === ALL_FILTER ? "ALL" : (reportType as StaffConsumptionType),
      }),
    [
      stockModule.staffConsumptions,
      reportFrom,
      reportTo,
      reportStaffId,
      reportDepartment,
      reportStation,
      reportType,
    ],
  );

  const reportSummary = useMemo(() => {
    const cost = reportRows.reduce((sum, row) => sum + row.inventoryCost, 0);
    const quantity = reportRows.reduce((sum, row) => sum + row.quantity, 0);
    const staffCount = new Set(reportRows.map((row) => row.staffMemberName)).size;
    return { cost, quantity, staffCount, lines: reportRows.length };
  }, [reportRows]);

  const previewLines = useMemo(() => {
    const validDrafts = draftLines
      .filter((line) => line.menuItemId && Number(line.quantity) > 0)
      .map((line) => ({
        menuItemId: line.menuItemId,
        quantity: Number(line.quantity),
        unitLabel: line.unitLabel,
        station: line.station,
        stockDeductionLocation: line.stockDeductionLocation,
        notes: line.notes.trim() || undefined,
      }));
    if (validDrafts.length === 0) return [];
    try {
      return buildStaffConsumptionLines({
        draftLines: validDrafts,
        menuItems,
        items: stockModule.items,
      });
    } catch {
      return [];
    }
  }, [draftLines, menuItems, stockModule.items]);

  const previewCost = useMemo(
    () => previewLines.reduce((sum, line) => sum + line.inventoryCost, 0),
    [previewLines],
  );

  if (!user) return null;

  function resetForm() {
    setStaffMemberId(isManager ? (selfStaff?.id ?? "") : (selfStaff?.id ?? ""));
    setMenuSearch("");
    setConsumptionType("Meal");
    setReason("");
    setDraftLines([
      {
        menuItemId: "",
        quantity: "1",
        unitLabel: "Plate",
        station: "Kitchen",
        stockDeductionLocation: "Kitchen",
        notes: "",
      },
    ]);
  }

  function resetBreakageForm() {
    setBreakageItemId("");
    setBreakageQuantity("1");
    setBreakageLocation("Kitchen");
    setBreakageReason("Broken glass");
    setBreakageNotes("");
    setChargeToStaff(false);
  }

  function updateDraftLine(index: number, patch: Partial<DraftLine>) {
    setDraftLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.menuItemId) {
          const menuItem = menuItems.find((item) => item.id === patch.menuItemId);
          if (menuItem) {
            const station = mapMenuStationToConsumptionStation(menuItem.station);
            const variants = defaultServingVariantsForMenuItem(menuItem);
            const defaultQuantity = defaultStaffConsumptionQuantityForMenuItem(menuItem);
            next.station = station;
            next.stockDeductionLocation = stationToDeductionLocation(station);
            next.unitLabel = variants[0] ?? "Plate";
            next.quantity = String(defaultQuantity);
            if (menuItem.stockDeductionLocation) {
              next.stockDeductionLocation = menuItem.stockDeductionLocation as OperationalStockLocation;
            }
          }
        }
        if (patch.station) {
          next.stockDeductionLocation = stationToDeductionLocation(patch.station);
        }
        return next;
      }),
    );
  }

  function addDraftLine() {
    setDraftLines((current) => [
      ...current,
      {
        menuItemId: "",
        quantity: "1",
        unitLabel: "Plate",
        station: "Kitchen",
        stockDeductionLocation: "Kitchen",
        notes: "",
      },
    ]);
  }

  function removeDraftLine(index: number) {
    setDraftLines((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  }

  function sendConsumptionToStations(document: StaffConsumptionDocument) {
    const stationOrder = buildStaffConsumptionStationOrder(document);
    const alreadyQueued = store.orders.some((order) => order.id === stationOrder.id);
    if (!alreadyQueued) {
      store.addOrder(stationOrder);
    }
    setTicketPreview({ orders: [stationOrder] });
    return stationOrder;
  }

  function handleSubmitConsumption() {
    if (!selectedStaff) {
      showError(t("Select a staff member.", "ሰራተኛ ይምረጡ።"));
      return;
    }

    const lines = draftLines
      .filter((line) => line.menuItemId && Number(line.quantity) > 0)
      .map((line) => ({
        menuItemId: line.menuItemId,
        quantity: Number(line.quantity),
        unitLabel: line.unitLabel,
        station: line.station,
        stockDeductionLocation: line.stockDeductionLocation,
        notes: line.notes.trim() || undefined,
      }));

    if (lines.length === 0) {
      showError(t("Add at least one menu item with quantity.", "ቢያንስ አንድ ሜኑ እቃ ከብዛት ያክሉ።"));
      return;
    }

    try {
      const draft = createStaffConsumptionDocument({
        staffMemberId: selectedStaff.id,
        staffMemberName: selectedStaff.name,
        employeeId: selectedStaff.employeeId,
        department: selectedStaff.department,
        role: selectedStaff.role,
        branch: selectedStaff.branch,
        shift: selectedStaff.shift,
        consumptionType,
        reason,
        recordedByManagerId: user.id,
        recordedByManagerName: user.name,
        menuItems,
        items: stockModule.items,
        lines,
        existingNumbers: stockModule.staffConsumptions.map((row) => row.consumptionNumber),
      });

      const result = postStaffConsumptionDocument({
        document: draft,
        menuItems,
        items: stockModule.items,
        recipes: stockModule.recipes,
        ledger: stockModule.ledger,
        lots: stockModule.lots,
        settings: stockModule.settings,
        postedBy: user.name,
      });

      stockModule.setLedger(result.ledger);
      stockModule.saveLots(result.lots);
      stockModule.saveStaffConsumption(result.document);
      sendConsumptionToStations(result.document);
      showSuccess(
        t(
          "Posted, sent to stations, and Bono ready under staff name.",
          "ተለጠፈ፣ ወደ ጣቢያዎች ተልኳል፣ ቦኖ በሰራተኛ ስም ዝግጁ ነው።",
        ),
        result.document.consumptionNumber,
      );
      resetForm();
      setTab("history");
    } catch (error) {
      showError(
        t("Could not save staff consumption.", "የሰራተኞች ፍጆታ ማስቀመጥ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleApproveConsumption(document: StaffConsumptionDocument) {
    try {
      const result = postStaffConsumptionDocument({
        document,
        menuItems,
        items: stockModule.items,
        recipes: stockModule.recipes,
        ledger: stockModule.ledger,
        lots: stockModule.lots,
        settings: stockModule.settings,
        postedBy: user.name,
      });
      stockModule.setLedger(result.ledger);
      stockModule.saveLots(result.lots);
      stockModule.saveStaffConsumption(result.document);
      sendConsumptionToStations(result.document);
      showSuccess(
        t("Consumption posted and sent to stations.", "ፍጆታ ተለጠፈ እና ወደ ጣቢያዎች ተልኳል።"),
        result.document.consumptionNumber,
      );
      if (viewDoc?.id === document.id) setViewDoc(result.document);
    } catch (error) {
      showError(
        t("Could not approve consumption.", "ፍጆታ ማጽደቅ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleRejectConsumption() {
    if (!rejectDoc || !rejectionReason.trim()) {
      showError(t("Rejection reason is required.", "የውድቅ ምክንያት ያስፈልጋል።"));
      return;
    }
    try {
      const next = rejectStaffConsumptionDocument({
        document: rejectDoc,
        rejectedBy: user.name,
        rejectionReason: rejectionReason.trim(),
      });
      stockModule.saveStaffConsumption(next);
      showSuccess(t("Consumption rejected.", "ፍጆታ ውድቅ ሆኗል።"), next.consumptionNumber);
      setRejectDoc(null);
      setRejectionReason("");
      if (viewDoc?.id === rejectDoc.id) setViewDoc(next);
    } catch (error) {
      showError(
        t("Could not reject consumption.", "ፍጆታ ውድቅ ማድረግ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleSubmitBreakage(postImmediately: boolean) {
    if (!selectedStaff) {
      showError(t("Select a staff member.", "ሰራተኛ ይምረጡ።"));
      return;
    }
    if (!breakageItem) {
      showError(t("Select the broken stock item.", "የተሰበረውን ክምችት እቃ ይምረጡ።"));
      return;
    }
    try {
      const draft = createStaffBreakageDocument({
        staffMemberId: selectedStaff.id,
        staffMemberName: selectedStaff.name,
        employeeId: selectedStaff.employeeId,
        department: selectedStaff.department,
        role: selectedStaff.role,
        branch: selectedStaff.branch,
        submittedById: user.id,
        submittedByName: user.name,
        location: breakageLocation,
        item: breakageItem,
        quantity: Number(breakageQuantity),
        unit: breakageItem.baseUnit,
        reason: breakageReason,
        notes: breakageNotes,
        chargeToStaff,
        existingNumbers: stockModule.staffBreakages.map((row) => row.breakageNumber),
      });

      if (!postImmediately) {
        stockModule.saveStaffBreakage(draft);
        showSuccess(
          t("Breakage voucher submitted for approval.", "የመሰባበር ቫውቸር ለማጽደቅ ተልኳል።"),
          draft.breakageNumber,
        );
        resetBreakageForm();
        setTab("history");
        return;
      }

      const result = postStaffBreakageDocument({
        document: draft,
        items: stockModule.items,
        ledger: stockModule.ledger,
        postedBy: user.name,
      });
      stockModule.setLedger(result.ledger);
      stockModule.saveStaffBreakage(result.document);
      showSuccess(t("Breakage voucher posted.", "የመሰባበር ቫውቸር ተለጠፈ።"), result.document.breakageNumber);
      resetBreakageForm();
      setTab("history");
    } catch (error) {
      showError(
        t("Could not save breakage voucher.", "የመሰባበር ቫውቸር ማስቀመጥ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleApproveBreakage(document: StaffBreakageDocument) {
    try {
      const result = postStaffBreakageDocument({
        document,
        items: stockModule.items,
        ledger: stockModule.ledger,
        postedBy: user.name,
      });
      stockModule.setLedger(result.ledger);
      stockModule.saveStaffBreakage(result.document);
      showSuccess(t("Breakage approved.", "መሰባበር ጸድቋል።"), result.document.breakageNumber);
      if (viewBreakage?.id === document.id) setViewBreakage(result.document);
    } catch (error) {
      showError(
        t("Could not approve breakage.", "መሰባበር ማጽደቅ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleRejectBreakage() {
    if (!rejectBreakage || !rejectionReason.trim()) {
      showError(t("Rejection reason is required.", "የውድቅ ምክንያት ያስፈልጋል።"));
      return;
    }
    try {
      const next = rejectStaffBreakageDocument({
        document: rejectBreakage,
        rejectedBy: user.name,
        rejectionReason: rejectionReason.trim(),
      });
      stockModule.saveStaffBreakage(next);
      showSuccess(t("Breakage rejected.", "መሰባበር ውድቅ ሆኗል።"), next.breakageNumber);
      setRejectBreakage(null);
      setRejectionReason("");
      if (viewBreakage?.id === rejectBreakage.id) setViewBreakage(next);
    } catch (error) {
      showError(
        t("Could not reject breakage.", "መሰባበር ውድቅ ማድረግ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleReverse() {
    if (!reverseDoc || !reversalReason.trim()) {
      showError(t("Reversal reason is required.", "የመመለስ ምክንያት ያስፈልጋል።"));
      return;
    }

    try {
      const result = reverseStaffConsumptionDocument({
        document: reverseDoc,
        ledger: stockModule.ledger,
        reversedBy: user.name,
        reversalReason: reversalReason.trim(),
      });

      stockModule.setLedger(result.ledger);
      stockModule.saveCancellationReversal(result.reversalVoucher);
      stockModule.saveStaffConsumption(result.document);
      stockModule.saveStaffConsumption(result.reversalDocument);
      showSuccess(
        t("Staff consumption reversed.", "የሰራተኞች ፍጆታ ተመለሰ።"),
        result.reversalDocument.consumptionNumber,
      );
      setReverseDoc(null);
      setReversalReason("");
      if (viewDoc?.id === reverseDoc.id) setViewDoc(result.document);
    } catch (error) {
      showError(
        t("Could not reverse record.", "መመለስ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function handleReverseBreakage() {
    if (!reverseBreakage || !reversalReason.trim()) {
      showError(t("Reversal reason is required.", "የመመለስ ምክንያት ያስፈልጋል።"));
      return;
    }
    try {
      const result = reverseStaffBreakageDocument({
        document: reverseBreakage,
        ledger: stockModule.ledger,
        reversedBy: user.name,
        reversalReason: reversalReason.trim(),
      });
      stockModule.setLedger(result.ledger);
      stockModule.saveCancellationReversal(result.reversalVoucher);
      stockModule.saveStaffBreakage(result.document);
      showSuccess(t("Breakage reversed.", "መሰባበር ተመለሰ።"), result.document.breakageNumber);
      setReverseBreakage(null);
      setReversalReason("");
      if (viewBreakage?.id === reverseBreakage.id) setViewBreakage(result.document);
    } catch (error) {
      showError(
        t("Could not reverse breakage.", "መሰባበር መመለስ አልተሳካም።"),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <PageHeader
        title="Staff Consumption"
        action={
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Chip tone="muted">{user.name}</Chip>
            <Chip tone="teff">{todayTotals.count} {t("posted today", "ዛሬ የተለጠፉ")}</Chip>
            {pendingCount > 0 ? (
              <Chip tone="ember">{pendingCount} {t("pending", "በመጠባበቅ")}</Chip>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Today's posted"
          value={String(todayTotals.count)}
          icon="ClipboardList"
          tone="ember"
        />
        <Stat
          label="Pending (breakage / legacy)"
          value={String(pendingCount)}
          icon="Clock"
        />
        <Stat
          label="Today's internal cost"
          value={formatETB(todayTotals.cost, lang)}
          icon="Wallet"
        />
        <Stat label="Revenue" value={formatETB(0, lang)} icon="Receipt" />
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        <TabButton active={tab === "record"} onClick={() => setTab("record")} icon={Icons.Utensils}>
          {t("My consumption", "የእኔ ፍጆታ")}
        </TabButton>
        <TabButton active={tab === "breakage"} onClick={() => setTab("breakage")} icon={Icons.GlassWater}>
          {t("Breakage", "መሰባበር")}
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")} icon={Icons.History}>
          {t("History", "ታሪክ")}
          {pendingCount > 0 ? <Chip tone="ember">{pendingCount}</Chip> : null}
        </TabButton>
        {isManager ? (
          <TabButton active={tab === "reports"} onClick={() => setTab("reports")} icon={Icons.BarChart3}>
            {t("Reports", "ሪፖርቶች")}
          </TabButton>
        ) : null}
      </div>

      {tab === "record" && (
        <div className="w-full min-w-0 space-y-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <p className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
            {t(
              "Posts stock immediately, sends items to stations, and prints Bono under the staff member who will use the items.",
              "ክምችት ወዲያውኑ ይለጠፋል፣ እቃዎች ወደ ጣቢያዎች ይላካሉ፣ ቦኖም በሚጠቀሙት ሰራተኛ ስም ይታተማል።",
            )}
          </p>
          {/* Step 1 — Who */}
          <section className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-ember/15 text-xs font-semibold text-ember">1</span>
              <h2 className="font-display text-base font-semibold">{t("Staff member", "ሰራተኛ")}</h2>
            </div>
            {isManager ? (
              <Select value={staffMemberId} onValueChange={setStaffMemberId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t("Select staff member", "ሰራተኛ ይምረጡ")} />
                </SelectTrigger>
                <SelectContent>
                  {staffDirectory.length === 0 && selfStaff ? (
                    <SelectItem value={selfStaff.id}>{selfStaff.name}</SelectItem>
                  ) : null}
                  {staffDirectory.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium">
                {selectedStaff?.name ?? user.name}
              </div>
            )}
            {selectedStaff ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Chip tone="teff">{selectedStaff.department || t("General", "አጠቃላይ")}</Chip>
                <Chip tone="muted">{selectedStaff.role || "—"}</Chip>
                <Chip tone="muted">{selectedStaff.shift || t("No shift", "ሽፍት የለም")}</Chip>
                <Chip tone="muted">{selectedStaff.branch}</Chip>
              </div>
            ) : null}
          </section>

          {/* Step 2 — Type & reason */}
          <section className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-ember/15 text-xs font-semibold text-ember">2</span>
              <h2 className="font-display text-base font-semibold">{t("Type & reason", "አይነት እና ምክንያት")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {STAFF_CONSUMPTION_TYPES.map((value) => {
                const selected = consumptionType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setConsumptionType(value)}
                    className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                      selected
                        ? "border-ember bg-ember text-white shadow-sm"
                        : "border-border bg-background hover:border-ember/40 hover:bg-ember/5"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Why? e.g. staff meal on shift", "ለምን? ለምሳሌ በሽፍት ላይ ምግብ")}
              className="h-12"
            />
          </section>

          {/* Step 3 — Items */}
          <section className="space-y-4 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-ember/15 text-xs font-semibold text-ember">3</span>
                <h2 className="font-display text-base font-semibold">{t("What was consumed?", "ምን ተጠቀመ?")}</h2>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addDraftLine}>
                <Icons.Plus className="size-4" />
                {t("Add item", "እቃ ጨምር")}
              </Button>
            </div>
            <div className="relative">
              <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder={t("Search by menu name or category…", "በሜኑ ስም ወይም ክፍል ይፈልጉ…")}
                className="h-12 pl-9"
              />
            </div>

            <div className="space-y-3">
              {draftLines.map((line, index) => {
                const menuItem = menuItems.find((item) => item.id === line.menuItemId);
                const variants = menuItem ? defaultServingVariantsForMenuItem(menuItem) : ["Plate"];
                const step = menuItem ? quantityStepForMenuItem(menuItem) : 1;
                const qtyNum = Number(line.quantity) || 0;

                return (
                  <div
                    key={index}
                    className="rounded-xl border border-border bg-muted/15 p-3 sm:p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("Item", "እቃ")} {index + 1}
                      </span>
                      {draftLines.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          onClick={() => removeDraftLine(index)}
                        >
                          <Icons.Trash2 className="size-3.5" />
                          {t("Remove", "አስወግድ")}
                        </Button>
                      ) : null}
                    </div>

                    <div className="grid gap-3 lg:grid-cols-12">
                      <div className="space-y-1.5 lg:col-span-5">
                        <Label className="text-xs text-muted-foreground">{t("Menu item", "ሜኑ")}</Label>
                        <Select
                          value={line.menuItemId}
                          onValueChange={(value) => updateDraftLine(index, { menuItemId: value })}
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue placeholder={t("Choose menu item", "ሜኑ ይምረጡ")} />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredMenuCategories.map((category) => (
                              <div key={category}>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{category}</div>
                                {filteredMenuItems
                                  .filter((item) => item.category === category)
                                  .map((item) => (
                                    <SelectItem key={item.id} value={item.id}>
                                      {item.name_en}
                                    </SelectItem>
                                  ))}
                              </div>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5 lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">{t("Serving", "አገልገሎት")}</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {variants.map((variant) => {
                            const selected = line.unitLabel === variant;
                            return (
                              <button
                                key={variant}
                                type="button"
                                onClick={() => updateDraftLine(index, { unitLabel: variant })}
                                className={`rounded-md border px-2.5 py-2 text-xs sm:text-sm transition-colors ${
                                  selected
                                    ? "border-ember bg-ember/10 font-medium text-ember"
                                    : "border-border bg-background hover:bg-muted"
                                }`}
                              >
                                {variant}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5 lg:col-span-2">
                        <Label className="text-xs text-muted-foreground">{t("Quantity", "ብዛት")}</Label>
                        <div className="flex h-11 items-center overflow-hidden rounded-md border border-input bg-background">
                          <button
                            type="button"
                            className="grid h-full w-11 place-items-center border-r border-input hover:bg-muted"
                            onClick={() =>
                              updateDraftLine(index, {
                                quantity: String(Math.max(0, Math.round((qtyNum - step) * 1000) / 1000)),
                              })
                            }
                            aria-label={t("Decrease", "ቀንስ")}
                          >
                            <Icons.Minus className="size-4" />
                          </button>
                          <Input
                            type="number"
                            min={0}
                            step={step}
                            value={line.quantity}
                            onChange={(e) => updateDraftLine(index, { quantity: e.target.value })}
                            className="h-full border-0 shadow-none focus-visible:ring-0 text-center"
                          />
                          <button
                            type="button"
                            className="grid h-full w-11 place-items-center border-l border-input hover:bg-muted"
                            onClick={() =>
                              updateDraftLine(index, {
                                quantity: String(Math.round((qtyNum + step) * 1000) / 1000),
                              })
                            }
                            aria-label={t("Increase", "ጨምር")}
                          >
                            <Icons.Plus className="size-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 lg:col-span-3">
                        <Label className="text-xs text-muted-foreground">{t("Station", "ጣቢያ")}</Label>
                        <Select
                          value={line.station}
                          onValueChange={(value) =>
                            updateDraftLine(index, { station: value as StaffConsumptionStation })
                          }
                        >
                          <SelectTrigger className="h-11">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAFF_CONSUMPTION_STATIONS.map((station) => (
                              <SelectItem key={station} value={station}>{station}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Actions */}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-muted-foreground">
              {t("By", "በ")}: <span className="font-medium text-foreground">{user.name}</span>
              <span className="mx-2">·</span>
              {t("Cost", "ወጪ")}: <span className="font-semibold text-foreground">{formatETB(previewCost, lang)}</span>
              <span className="mx-2">·</span>
              {t("Revenue", "ገቢ")}: <span className="font-medium">{formatETB(0, lang)}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11 px-5" onClick={resetForm}>
                {t("Clear", "አጽዳ")}
              </Button>
              <Button type="button" className="h-11 px-6" onClick={handleSubmitConsumption}>
                <Icons.Send className="size-4" />
                {t("Send to stations & print Bono", "ወደ ጣቢያዎች ላክ እና ቦኖ አትም")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {tab === "breakage" && (
        <div className="w-full min-w-0 space-y-6 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <section className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-ember/15 text-xs font-semibold text-ember">1</span>
              <h2 className="font-display text-base font-semibold">{t("Staff member", "ሰራተኛ")}</h2>
            </div>
            {isManager ? (
              <Select value={staffMemberId} onValueChange={setStaffMemberId}>
                <SelectTrigger className="h-12">
                  <SelectValue placeholder={t("Select staff member", "ሰራተኛ ይምረጡ")} />
                </SelectTrigger>
                <SelectContent>
                  {staffDirectory.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium">
                {selectedStaff?.name ?? user.name}
              </div>
            )}
            {selectedStaff ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Chip tone="teff">{selectedStaff.department || t("General", "አጠቃላይ")}</Chip>
                <Chip tone="muted">{selectedStaff.role || "—"}</Chip>
                <Chip tone="muted">{selectedStaff.branch}</Chip>
              </div>
            ) : null}
          </section>

          <section className="space-y-3 rounded-xl border border-border/80 bg-muted/10 p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-full bg-ember/15 text-xs font-semibold text-ember">2</span>
              <h2 className="font-display text-base font-semibold">{t("Broken item", "የተሰበረ እቃ")}</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("Stock item", "የክምችት እቃ")} className="sm:col-span-2">
                <Select value={breakageItemId} onValueChange={setBreakageItemId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder={t("Select glass, plate, bottle…", "ብርጭቆ፣ ሳህን፣ ጠርሙስ ይምረጡ…")} />
                  </SelectTrigger>
                  <SelectContent>
                    {breakageItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} · {item.category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("Location", "ቦታ")}>
                <Select value={breakageLocation} onValueChange={(value) => setBreakageLocation(value as StockLocation)}>
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STOCK_LOCATIONS.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("Quantity", "ብዛት")}>
                <Input
                  type="number"
                  min="0.001"
                  step="1"
                  className="h-12"
                  value={breakageQuantity}
                  onChange={(e) => setBreakageQuantity(e.target.value)}
                />
              </Field>
              <Field label={t("Reason", "ምክንያት")}>
                <Select
                  value={breakageReason}
                  onValueChange={(value) => setBreakageReason(value as (typeof STAFF_BREAKAGE_REASONS)[number])}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAFF_BREAKAGE_REASONS.map((reasonOption) => (
                      <SelectItem key={reasonOption} value={reasonOption}>
                        {reasonOption}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("Notes", "ማስታወሻ")}>
                <Input
                  className="h-12"
                  value={breakageNotes}
                  onChange={(e) => setBreakageNotes(e.target.value)}
                  placeholder={t("Optional details", "ተጨማሪ ዝርዝር")}
                />
              </Field>
            </div>
            {breakageItem ? (
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Chip tone="muted">
                  {t("Unit", "መለኪያ")}: {breakageItem.baseUnit}
                </Chip>
                <Chip tone="muted">
                  {t("On hand", "ያለው")}: {breakageBalance?.availableQuantity ?? 0} {breakageItem.baseUnit}
                </Chip>
                <Chip tone="muted">
                  {t("Cost", "ወጪ")}: {formatETB(Number(breakageQuantity || 0) * breakageItem.purchasePrice, lang)}
                </Chip>
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={chargeToStaff}
                onChange={(e) => setChargeToStaff(e.target.checked)}
              />
              {t("Charge this breakage to the staff member", "ይህ መሰባበር በሰራተኛው ላይ ይከፈል")}
            </label>
          </section>

          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-card/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-sm text-muted-foreground">
              {t("By", "በ")}: <span className="font-medium text-foreground">{user.name}</span>
              {breakageItem ? (
                <>
                  <span className="mx-2">·</span>
                  {t("Write-off", "መሰረዝ")}:{" "}
                  <span className="font-semibold text-foreground">
                    {formatETB(Number(breakageQuantity || 0) * breakageItem.purchasePrice, lang)}
                  </span>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="h-11 px-5" onClick={resetBreakageForm}>
                {t("Clear", "አጽዳ")}
              </Button>
              <Button type="button" variant="outline" className="h-11 px-6" onClick={() => handleSubmitBreakage(false)}>
                <Icons.Send className="size-4" />
                {t("Submit for approval", "ለማጽደቅ ላክ")}
              </Button>
              {isManager ? (
                <Button type="button" className="h-11 px-6" onClick={() => handleSubmitBreakage(true)}>
                  <Icons.Check className="size-4" />
                  {t("Post now", "አሁን ለጥፍ")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          {isManager && pendingCount > 0 ? (
            <Card>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">
                  {t("Pending (breakage / legacy consumption)", "በመጠባበቅ (መሰባበር / የድሮ ፍጆታ)")}
                </h2>
                <Chip tone="ember">{pendingCount}</Chip>
              </div>
              <div className="space-y-2">
                {pendingConsumptions.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div>
                      <div className="font-medium">{doc.consumptionNumber} · {doc.staffMemberName}</div>
                      <div className="text-xs text-muted-foreground">
                        {doc.consumptionType} · {doc.lines.map((line) => line.menuItemName).join(", ")}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" onClick={() => handleApproveConsumption(doc)}>
                        {t("Post & print Bono", "ለጥፍ እና ቦኖ አትም")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectDoc(doc);
                          setRejectionReason("");
                        }}
                      >
                        {t("Reject", "ውድቅ")}
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingBreakages.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                    <div>
                      <div className="font-medium">{doc.breakageNumber} · {doc.staffMemberName}</div>
                      <div className="text-xs text-muted-foreground">
                        {doc.quantity} {doc.unit} {doc.itemName} · {doc.reason}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" onClick={() => handleApproveBreakage(doc)}>
                        {t("Approve", "አጽድቅ")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRejectBreakage(doc);
                          setRejectionReason("");
                        }}
                      >
                        {t("Reject", "ውድቅ")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">{t("Consumption records", "የፍጆታ መዝገቦች")}</h2>
              <Chip tone="muted">{visibleConsumptions.length} {t("records", "መዝገቦች")}</Chip>
            </div>
            {visibleConsumptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No staff consumption recorded yet.", "እስካሁን የሰራተኞች ፍጆታ አልተመዘገበም።")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Reference", "ማጣቀሻ")}</TableHead>
                      <TableHead>{t("Date", "ቀን")}</TableHead>
                      <TableHead>{t("Staff", "ሰራተኛ")}</TableHead>
                      <TableHead>{t("Type", "አይነት")}</TableHead>
                      <TableHead>{t("Items", "እቃዎች")}</TableHead>
                      <TableHead>{t("Cost", "ወጪ")}</TableHead>
                      <TableHead>{t("Status", "ሁኔታ")}</TableHead>
                      <TableHead className="text-right">{t("Actions", "እርምጃዎች")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleConsumptions.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.consumptionNumber}</TableCell>
                        <TableCell>{formatDateTime(doc.recordedAt, {}, lang)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{doc.staffMemberName}</div>
                          <div className="text-xs text-muted-foreground">{doc.department}</div>
                        </TableCell>
                        <TableCell>{doc.consumptionType}</TableCell>
                        <TableCell>
                          {doc.lines.map((line) => line.menuItemName).join(", ")}
                        </TableCell>
                        <TableCell>{formatETB(doc.totalInventoryCost, lang)}</TableCell>
                        <TableCell>
                          <Chip tone={statusTone(doc.status)}>{doc.status}</Chip>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setViewDoc(doc)}>
                              {t("View", "እይ")}
                            </Button>
                            {isManager && doc.status === "Submitted" ? (
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleApproveConsumption(doc)}>
                                {t("Post & print Bono", "ለጥፍ እና ቦኖ አትም")}
                              </Button>
                            ) : null}
                            {doc.status === "Posted" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => sendConsumptionToStations(doc)}
                              >
                                {t("Print Bono", "ቦኖ አትም")}
                              </Button>
                            ) : null}
                            {isManager && doc.status === "Posted" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  setReverseDoc(doc);
                                  setReversalReason("");
                                }}
                              >
                                {t("Reverse", "መለስ")}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">{t("Breakage vouchers", "የመሰባበር ቫውቸሮች")}</h2>
              <Chip tone="muted">{visibleBreakages.length} {t("records", "መዝገቦች")}</Chip>
            </div>
            {visibleBreakages.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("No staff breakage recorded yet.", "እስካሁን የሰራተኛ መሰባበር አልተመዘገበም።")}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Reference", "ማጣቀሻ")}</TableHead>
                      <TableHead>{t("Date", "ቀን")}</TableHead>
                      <TableHead>{t("Staff", "ሰራተኛ")}</TableHead>
                      <TableHead>{t("Item", "እቃ")}</TableHead>
                      <TableHead>{t("Qty", "ብዛት")}</TableHead>
                      <TableHead>{t("Cost", "ወጪ")}</TableHead>
                      <TableHead>{t("Charge", "ክፍያ")}</TableHead>
                      <TableHead>{t("Status", "ሁኔታ")}</TableHead>
                      <TableHead className="text-right">{t("Actions", "እርምጃዎች")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBreakages.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.breakageNumber}</TableCell>
                        <TableCell>{formatDateTime(doc.recordedAt, {}, lang)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{doc.staffMemberName}</div>
                          <div className="text-xs text-muted-foreground">{doc.location}</div>
                        </TableCell>
                        <TableCell>{doc.itemName}</TableCell>
                        <TableCell>{doc.quantity} {doc.unit}</TableCell>
                        <TableCell>{formatETB(doc.totalCost, lang)}</TableCell>
                        <TableCell>{doc.chargeToStaff ? t("Staff", "ሰራተኛ") : t("House", "ቤት")}</TableCell>
                        <TableCell>
                          <Chip tone={statusTone(doc.status)}>{doc.status}</Chip>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setViewBreakage(doc)}>
                              {t("View", "እይ")}
                            </Button>
                            {isManager && doc.status === "Submitted" ? (
                              <Button type="button" variant="ghost" size="sm" onClick={() => handleApproveBreakage(doc)}>
                                {t("Approve", "አጽድቅ")}
                              </Button>
                            ) : null}
                            {isManager && doc.status === "Posted" ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => {
                                  setReverseBreakage(doc);
                                  setReversalReason("");
                                }}
                              >
                                {t("Reverse", "መለስ")}
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "reports" && isManager && (
        <div className="space-y-4">
          <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t("From", "ከ")}>
              <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} />
            </Field>
            <Field label={t("To", "እስከ")}>
              <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} />
            </Field>
            <Field label={t("Staff", "ሰራተኛ")}>
              <Select value={reportStaffId} onValueChange={setReportStaffId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>{t("All staff", "ሁሉም ሰራተኞች")}</SelectItem>
                  {staffDirectory.map((member) => (
                    <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Department", "ክፍል")}>
              <Select value={reportDepartment} onValueChange={setReportDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>{t("All departments", "ሁሉም ክፍሎች")}</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Station", "ጣቢያ")}>
              <Select value={reportStation} onValueChange={setReportStation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>{t("All stations", "ሁሉም ጣቢያዎች")}</SelectItem>
                  {STAFF_CONSUMPTION_STATIONS.map((station) => (
                    <SelectItem key={station} value={station}>{station}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("Consumption type", "የፍጆታ አይነት")} className="sm:col-span-2 lg:col-span-1">
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER}>{t("All types", "ሁሉም አይነቶች")}</SelectItem>
                  {STAFF_CONSUMPTION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Card>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Report lines" value={String(reportSummary.lines)} icon="List" />
            <Stat label="Staff covered" value={String(reportSummary.staffCount)} icon="Users" />
            <Stat
              label="Internal cost"
              value={formatETB(reportSummary.cost, lang)}
              icon="Wallet"
              tone="ember"
            />
          </div>

          <Card>
            {reportRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("No staff consumption in this period.", "በዚህ ጊዜ የሰራተኞች ፍጆታ የለም።")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("Date", "ቀን")}</TableHead>
                      <TableHead>{t("Reference", "ማጣቀሻ")}</TableHead>
                      <TableHead>{t("Staff", "ሰራተኛ")}</TableHead>
                      <TableHead>{t("Department", "ክፍል")}</TableHead>
                      <TableHead>{t("Item", "እቃ")}</TableHead>
                      <TableHead>{t("Serving", "አገልገሎት")}</TableHead>
                      <TableHead>{t("Qty", "ብዛት")}</TableHead>
                      <TableHead>{t("Station", "ጣቢያ")}</TableHead>
                      <TableHead>{t("Recorded by", "የመዘገበው")}</TableHead>
                      <TableHead className="text-right">{t("Cost", "ወጪ")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRows.map((row, index) => (
                      <TableRow key={`${row.referenceNo}-${row.itemName}-${index}`}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className="font-mono text-xs">{row.referenceNo}</TableCell>
                        <TableCell>{row.staffMemberName}</TableCell>
                        <TableCell>{row.department}</TableCell>
                        <TableCell>{row.itemName}</TableCell>
                        <TableCell>{row.unitLabel}</TableCell>
                        <TableCell>{row.quantity}</TableCell>
                        <TableCell>{row.station}</TableCell>
                        <TableCell>{row.recordedBy}</TableCell>
                        <TableCell className="text-right">{formatETB(row.inventoryCost, lang)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </div>
      )}

      <Dialog open={viewDoc != null} onOpenChange={(open) => !open && setViewDoc(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewDoc ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewDoc.consumptionNumber}</DialogTitle>
                <DialogDescription>
                  {viewDoc.staffMemberName} · {formatDateTime(viewDoc.recordedAt, {}, lang)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">{t("Employee ID", "የሰራተኛ መለያ")}: </span>{viewDoc.employeeId}</div>
                <div><span className="text-muted-foreground">{t("Department", "ክፍል")}: </span>{viewDoc.department}</div>
                <div><span className="text-muted-foreground">{t("Role", "ሚና")}: </span>{viewDoc.role}</div>
                <div><span className="text-muted-foreground">{t("Branch", "ቅርንጫፍ")}: </span>{viewDoc.branch}</div>
                <div><span className="text-muted-foreground">{t("Type", "አይነት")}: </span>{viewDoc.consumptionType}</div>
                <div><span className="text-muted-foreground">{t("Status", "ሁኔታ")}: </span><Chip tone={statusTone(viewDoc.status)}>{viewDoc.status}</Chip></div>
                <div><span className="text-muted-foreground">{t("Submitted by", "ያቀረበው")}: </span>{viewDoc.submittedByName ?? viewDoc.recordedByManagerName}</div>
                <div className="sm:col-span-2"><span className="text-muted-foreground">{t("Reason", "ምክንያት")}: </span>{viewDoc.reason}</div>
                {viewDoc.notes ? (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">{t("Notes", "ማስታወሻ")}: </span>{viewDoc.notes}</div>
                ) : null}
                <div><span className="text-muted-foreground">{t("Revenue", "ገቢ")}: </span>{formatETB(0, lang)}</div>
                <div><span className="text-muted-foreground">{t("Inventory cost", "የክምችት ወጪ")}: </span>{formatETB(viewDoc.totalInventoryCost, lang)}</div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Item", "እቃ")}</TableHead>
                    <TableHead>{t("Serving", "አገልገሎት")}</TableHead>
                    <TableHead>{t("Qty", "ብዛት")}</TableHead>
                    <TableHead>{t("Deduction", "ቅነሳ")}</TableHead>
                    <TableHead>{t("Station", "ጣቢያ")}</TableHead>
                    <TableHead className="text-right">{t("Cost", "ወጪ")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewDoc.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>{line.menuItemName}</TableCell>
                      <TableCell>{line.unitLabel}</TableCell>
                      <TableCell>{line.quantity}</TableCell>
                      <TableCell>{line.deductionQuantity} {line.deductionUnit}</TableCell>
                      <TableCell>{line.station}</TableCell>
                      <TableCell className="text-right">{formatETB(line.inventoryCost, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {viewDoc.status === "Posted" ? (
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => sendConsumptionToStations(viewDoc)}>
                    <Icons.Printer className="size-4" />
                    {t("Print Bono", "ቦኖ አትም")}
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={reverseDoc != null} onOpenChange={(open) => !open && setReverseDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reverse staff consumption", "የሰራተኞች ፍጆታ መመለስ")}</DialogTitle>
            <DialogDescription>
              {reverseDoc
                ? t(
                    `Reverse ${reverseDoc.consumptionNumber} for ${reverseDoc.staffMemberName}. Posted records cannot be edited — only reversed.`,
                    `${reverseDoc.consumptionNumber} ለ ${reverseDoc.staffMemberName} መመለስ። የተለጠፉ መዝገቦች ሊቀየር አይችሉም — ተመልሰው ይቀራል።`,
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          <Field label={t("Reversal reason", "የመመለስ ምክንያት")}>
            <Input
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder={t("Required", "አስፈላጊ")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReverseDoc(null)}>
              {t("Cancel", "ይቅር")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleReverse}>
              {t("Confirm reversal", "መመለስ አረጋግጥ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={viewBreakage != null} onOpenChange={(open) => !open && setViewBreakage(null)}>
        <DialogContent className="max-w-lg">
          {viewBreakage ? (
            <>
              <DialogHeader>
                <DialogTitle>{viewBreakage.breakageNumber}</DialogTitle>
                <DialogDescription>
                  {viewBreakage.staffMemberName} · {formatDateTime(viewBreakage.recordedAt, {}, lang)}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div><span className="text-muted-foreground">{t("Item", "እቃ")}: </span>{viewBreakage.itemName}</div>
                <div><span className="text-muted-foreground">{t("Qty", "ብዛት")}: </span>{viewBreakage.quantity} {viewBreakage.unit}</div>
                <div><span className="text-muted-foreground">{t("Location", "ቦታ")}: </span>{viewBreakage.location}</div>
                <div><span className="text-muted-foreground">{t("Status", "ሁኔታ")}: </span><Chip tone={statusTone(viewBreakage.status)}>{viewBreakage.status}</Chip></div>
                <div><span className="text-muted-foreground">{t("Reason", "ምክንያት")}: </span>{viewBreakage.reason}</div>
                <div><span className="text-muted-foreground">{t("Charge", "ክፍያ")}: </span>{viewBreakage.chargeToStaff ? t("Staff", "ሰራተኛ") : t("House", "ቤት")}</div>
                <div><span className="text-muted-foreground">{t("Cost", "ወጪ")}: </span>{formatETB(viewBreakage.totalCost, lang)}</div>
                <div><span className="text-muted-foreground">{t("Submitted by", "ያቀረበው")}: </span>{viewBreakage.submittedByName}</div>
                {viewBreakage.notes ? (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">{t("Notes", "ማስታወሻ")}: </span>{viewBreakage.notes}</div>
                ) : null}
                {viewBreakage.rejectionReason ? (
                  <div className="sm:col-span-2"><span className="text-muted-foreground">{t("Rejection", "ውድቅ")}: </span>{viewBreakage.rejectionReason}</div>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectDoc != null || rejectBreakage != null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectDoc(null);
            setRejectBreakage(null);
            setRejectionReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reject request", "ጥያቄ ውድቅ አድርግ")}</DialogTitle>
            <DialogDescription>
              {rejectDoc
                ? t(`Reject ${rejectDoc.consumptionNumber} for ${rejectDoc.staffMemberName}.`, `${rejectDoc.consumptionNumber} ለ ${rejectDoc.staffMemberName} ውድቅ።`)
                : rejectBreakage
                  ? t(`Reject ${rejectBreakage.breakageNumber} for ${rejectBreakage.staffMemberName}.`, `${rejectBreakage.breakageNumber} ለ ${rejectBreakage.staffMemberName} ውድቅ።`)
                  : null}
            </DialogDescription>
          </DialogHeader>
          <Field label={t("Rejection reason", "የውድቅ ምክንያት")}>
            <Input
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t("Required", "አስፈላጊ")}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDoc(null);
                setRejectBreakage(null);
              }}
            >
              {t("Cancel", "ይቅር")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={rejectDoc ? handleRejectConsumption : handleRejectBreakage}
            >
              {t("Confirm reject", "ውድቅ አረጋግጥ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={reverseBreakage != null}
        onOpenChange={(open) => {
          if (!open) setReverseBreakage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reverse staff breakage", "የሰራተኛ መሰባበር መመለስ")}</DialogTitle>
            <DialogDescription>
              {reverseBreakage
                ? t(
                    `Reverse ${reverseBreakage.breakageNumber} for ${reverseBreakage.staffMemberName}.`,
                    `${reverseBreakage.breakageNumber} ለ ${reverseBreakage.staffMemberName} መመለስ።`,
                  )
                : null}
            </DialogDescription>
          </DialogHeader>
          <Field label={t("Reversal reason", "የመመለስ ምክንያት")}>
            <Input
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder={t("Required", "አስፈላጊ")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReverseBreakage(null)}>
              {t("Cancel", "ይቅር")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleReverseBreakage}>
              {t("Confirm reversal", "መመለስ አረጋግጥ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {ticketPreview ? (
        <StationTicketPreviewDialog view={ticketPreview} onClose={() => setTicketPreview(null)} />
      ) : null}
    </div>
  );
}
