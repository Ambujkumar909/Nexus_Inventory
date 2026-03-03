
import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  User,
  Laptop,
  LaptopRequest,
  LaptopEditRequest
} from './types';

import {
  UserRole,
  RequestStatus,
  LaptopStatus,
  RequestType
} from './types';

import { supabase } from './supabase';
import Layout from './components/Layout';
import { MetricCard } from './components/DashboardCards';
import { StatusBadge } from './components/StatusBadge';
import { Icons } from './constants';

const App: React.FC = () => {
  // Session & Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'user' | 'verify'>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dbError, setDbError] = useState<string | null>(null);
  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Show 50 laptops per page
  // Master Data
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [requests, setRequests] = useState<LaptopRequest[]>([]);
  const [allProfiles, setAllProfiles] = useState<User[]>([]);
  const [editRequests, setEditRequests] = useState<LaptopEditRequest[]>([]);
  const [importReport, setImportReport] = useState<{
  total: number;
  successCount: number;
  rejected: { row: number; serial: string; data: string; reason: string }[]; 
    successful: { row: number; brand: string; model: string; serial: string; tag: string }[]; // <-- ADDED THIS
  } | null>(null);
  
  // Form States
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    employeeId: '',
    mobileNumber: '',

  });
  // Add this near your other useState hooks
  const [searchError, setSearchError] = useState(false);
  const [signupStatus, setSignupStatus] = useState<{ type: 'idle' | 'loading' | 'error' | 'success', message?: string }>({ type: 'idle' });

  const [userRequestForm, setUserRequestForm] = useState({ employeeId: '', name: '', type: RequestType.PERMANENT, reason: '', returnDate: '' });
  const [trackingId, setTrackingId] = useState('');
  const [trackedRequest, setTrackedRequest] = useState<LaptopRequest | null>(null);
  const [isAddingLaptop, setIsAddingLaptop] = useState(false);
  const [newLaptop, setNewLaptop] = useState({ brand: '', model: '', serialNumber: '', serviceId: '', specs: '', purchaseDate: '' });
  const [assigningToRequest, setAssigningToRequest] = useState<string | null>(null);
  const [editingLaptop, setEditingLaptop] = useState<Laptop | null>(null);
  // --- HISTORY TAB STATE ---
  // --- HISTORY TAB STATE ---
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterBrand, setHistoryFilterBrand] = useState("ALL");
  const [historyFilterStatus, setHistoryFilterStatus] = useState("ALL"); // 👇 NEW
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [viewingHistoryDetails, setViewingHistoryDetails] = useState<LaptopRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<LaptopRequest | null>(null);
  // --- SEARCH & FILTER ENGINE ---
  // --- SEARCH & FILTER ENGINE (UPDATED) ---
  // --- SEARCH & FILTER ENGINE (ROBUST VERSION) ---
  const [searchQuery, setSearchQuery] = useState("");
  const [filterBrand, setFilterBrand] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterRam, setFilterRam] = useState("ALL");
  const [filterStorage, setFilterStorage] = useState("ALL");
  const [filterCpu, setFilterCpu] = useState("ALL");

  // Helper: Removes spaces & lowercase (e.g., "1 TB" -> "1tb")
  const normalize = (str) => str ? str.toLowerCase().replace(/\s+/g, '') : "";

  // --- ROBUST FILTERING ENGINE ---
  const filteredLaptops = useMemo(() => {
    return laptops.filter(laptop => {
      // 1. SAFETY: Hide Scrapped items
      if (laptop.status === LaptopStatus.SCRAP) return false;

      // 2. Prepare Data
      const brand = (laptop.brand || "").toLowerCase();
      const model = (laptop.model || "").toLowerCase();
      const serial = (laptop.serial_number || "").toLowerCase();
      const tag = (laptop.service_id || "").toLowerCase();

      // CRITICAL FIX: Split specs into an array of clean items
      // Example: "Intel Core i5, 8gb, 512gb" -> ["intelcorei5", "8gb", "512gb"]
      const specItems = (laptop.specs || "")
        .toLowerCase()
        .split(',')
        .map(item => item.trim().replace(/\s+/g, '')); // Remove spaces

      // 3. Search Logic
      const s = searchQuery.toLowerCase().trim();
      const matchesSearch =
        s === "" ||
        brand.includes(s) ||
        model.includes(s) ||
        serial.includes(s) ||
        tag.includes(s);

      // 4. Dropdown Logic
      const matchesBrand = filterBrand === "ALL" || brand === filterBrand.toLowerCase();
      const matchesStatus = filterStatus === "ALL" || laptop.status === filterStatus;

      // 5. Specs Logic (EXACT MATCHING to fix the 12gb vs 512gb bug)

      // RAM: Check if any item in the list is EXACTLY "12gb" (not just part of "512gb")
      const matchesRam = filterRam === "ALL" || specItems.some(item => item === filterRam.toLowerCase().replace(/\s+/g, ''));

      // Storage: Check if any item is EXACTLY the storage value
      const matchesStorage = filterStorage === "ALL" || specItems.some(item => item === filterStorage.toLowerCase().replace(/\s+/g, ''));

      // CPU: We still allow partial match for CPU (e.g. "i5" matches "intelcorei5")
      const matchesCpu = filterCpu === "ALL" || specItems.some(item => item.includes(filterCpu.toLowerCase().replace(/\s+/g, '')));

      return matchesSearch && matchesBrand && matchesStatus && matchesRam && matchesStorage && matchesCpu;
    });
  }, [laptops, searchQuery, filterBrand, filterStatus, filterRam, filterStorage, filterCpu]);
  // --- HISTORY ENGINE ---
  const historyLog = useMemo(() => {
    // 1. Strictly Assignments and Returns only
    const activeAndPastDeployments = requests.filter(
      r => r.status === RequestStatus.ASSIGNED || r.status === RequestStatus.RETURNED
    );

    // 2. Map laptop data
    const enrichedHistory = activeAndPastDeployments.map(req => {
      const laptop = laptops.find(l => l.id === req.assigned_laptop_id);
      return { ...req, laptopDetails: laptop };
    });

    // 3. Filter the enriched data
    return enrichedHistory.filter(record => {
      // --- ROBUST SEARCH ---
      const s = historySearch.toLowerCase().trim();
      const empName = (record.employee_name || "").toLowerCase();
      const empId = (record.employee_id || "").toLowerCase();
      const brand = (record.laptopDetails?.brand || "").toLowerCase();
      const model = (record.laptopDetails?.model || "").toLowerCase();
      const serial = (record.laptopDetails?.serial_number || "").toLowerCase();
      const tag = (record.laptopDetails?.service_id || "").toLowerCase();

      const matchesSearch = s === "" ||
        empName.includes(s) || empId.includes(s) ||
        brand.includes(s) || model.includes(s) ||
        serial.includes(s) || tag.includes(s);

      // --- BRAND FILTER ---
      const matchesBrand = historyFilterBrand === "ALL" || brand === historyFilterBrand.toLowerCase();

      // --- STATUS FILTER --- 👇 NEW
      const matchesStatus = historyFilterStatus === "ALL" || record.status === historyFilterStatus;

      // --- ROBUST DATE RANGE FILTER ---
      let matchesDate = true;
      if (historyFromDate || historyToDate) {
        const from = historyFromDate ? new Date(historyFromDate).getTime() : null;
        let to = null;
        
        if (historyToDate) {
          const d = new Date(historyToDate);
          d.setHours(23, 59, 59, 999);
          to = d.getTime();
        }

        const assignedTime = record.assigned_at ? new Date(record.assigned_at).getTime() : null;
        const returnedTime = record.actual_return_date ? new Date(record.actual_return_date).getTime() : null;

        const assignedInRange = assignedTime !== null && (!from || assignedTime >= from) && (!to || assignedTime <= to);
        const returnedInRange = returnedTime !== null && (!from || returnedTime >= from) && (!to || returnedTime <= to);

        matchesDate = assignedInRange || returnedInRange;
      }

      // 👇 Added matchesStatus here
      return matchesSearch && matchesBrand && matchesStatus && matchesDate;
    });
  }, [requests, laptops, historySearch, historyFilterBrand, historyFilterStatus, historyFromDate, historyToDate]);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;

  // Get Current Items (Use THIS variable in your <tbody> map)
  const currentLaptops = filteredLaptops.slice(indexOfFirstItem, indexOfLastItem);

  // Calculate Total Pages
  const totalPages = Math.ceil(filteredLaptops.length / itemsPerPage);
  // --- PAGINATION LOGIC HELPER ---
  const getPaginationGroup = () => {
    const pageNumbers = [];
    const siblingCount = 1; // How many numbers to show next to current page
    const totalNumbers = siblingCount + 5; // Total buttons to show (including ... and first/last)

    // Case 1: If total pages is small (less than 7), show all blocks
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      // Case 2: Complex Pagination with Dots
      const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
      const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

      const showLeftDots = leftSiblingIndex > 2;
      const showRightDots = rightSiblingIndex < totalPages - 2;

      // Sub-Case: No Left Dots, but Right Dots (e.g. 1 2 3 4 ... 20)
      if (!showLeftDots && showRightDots) {
        let leftItemCount = 3 + 2 * siblingCount;
        let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
        return [...leftRange, "...", totalPages];
      }

      // Sub-Case: No Right Dots, but Left Dots (e.g. 1 ... 17 18 19 20)
      if (showLeftDots && !showRightDots) {
        let rightItemCount = 3 + 2 * siblingCount;
        let rightRange = Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
        return [1, "...", ...rightRange];
      }

      // Sub-Case: Both Dots (e.g. 1 ... 9 10 11 ... 20)
      if (showLeftDots && showRightDots) {
        let middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
        return [1, "...", ...middleRange, "...", totalPages];
      }
    }
    return pageNumbers;
  };
  // Auto-Reset to Page 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterBrand, filterStatus, filterRam, filterStorage, filterCpu]);
  const closeAddLaptopModal = () => {
    setIsAddingLaptop(false);
    // WIPE THE DATA
    setNewLaptop({ brand: '', model: '', serialNumber: '', serviceId: '', specs: '', purchaseDate: '' });
  };
  // Helper to display dates as DD-MM-YYYY

  // Computed Stats
  const stats = useMemo(() => ({
    totalLaptops: laptops.length,
    availableLaptops: laptops.filter(l => l.status === LaptopStatus.AVAILABLE).length,
    pendingRequests: requests.filter(r => r.status === RequestStatus.PENDING).length,
    scrappedLaptops: laptops.filter(l => l.status === LaptopStatus.SCRAP).length,
    pendingRevisions: editRequests.filter(e => e.status === 'PENDING').length,
    activeLoans: requests.filter(r => r.status === RequestStatus.ASSIGNED && r.type === RequestType.TEMPORARY).length,
  }), [laptops, requests, editRequests]);

  const inputClass = "w-full px-6 py-4 rounded-2xl border border-[#EAE3D5] bg-white text-slate-700 placeholder:text-slate-300 focus:ring-4 focus:ring-slate-50 focus:border-[#D8CDBA] outline-none transition-all duration-300 disabled:opacity-50";
  const labelClass = "block text-[11px] font-extrabold text-slate-400 uppercase tracking-[0.2em] mb-3 px-1";

  // --- Data Sync ---
  useEffect(() => {
    checkUser();
    fetchData();
  }, []);

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') return;
          throw error;
        }

        if (profile) {
          // If the profile is not approved, we need to sign them out unless they are Root.
          // However, if they JUST signed up, we don't want to abruptly switch the authMode to 'signin'
          // because handleSignUp is already showing a success message.
          if (!profile.is_approved && profile.role !== UserRole.ROOT) {
            await supabase.auth.signOut();
            if (!isNewSignUp) {
              setSignupStatus({ type: 'error', message: 'Identity Pending Clearance. Contact System Root.' });
              setAuthMode('signin');
            }
            return;
          }
          setCurrentUser({
            id: profile.id,
            employeeId: profile.employee_id,
            name: profile.name,
            mobileNumber: profile.mobile_number,
            email: profile.email,
            role: profile.role as UserRole,
            isApproved: profile.is_approved
          });
        }
      } else {
        // Only force sign-in mode if we're not currently on the signup page
        if (authMode !== 'signup') {
          setAuthMode('user');
        }
      }
    } catch (e: any) {
      setDbError('Authentication system failure.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchData = async () => {
    try {
      const [laptopsRes, requestsRes, profilesRes, revisionsRes] = await Promise.all([
        // 1. Inventory: Fetch 10,000
        supabase.from('laptops')
          .select('*')
          .range(0, 9999)
          .order('created_at', { ascending: false }),

        // 2. User Requests: Fetch 10,000
        supabase.from('laptop_requests')
          .select('*')
          .range(0, 9999) // <--- Added
          .order('requested_at', { ascending: false }),

        // 3. User Profiles: Fetch 10,000
        supabase.from('profiles')
          .select('*')
          .range(0, 9999) // <--- Added
          .order('created_at', { ascending: false }),

        // 4. Edit Revisions: Fetch 10,000
        supabase.from('laptop_edit_requests')
          .select('*')
          .range(0, 9999) // <--- Added
          .order('requested_at', { ascending: false })
      ]);
      if (laptopsRes.data) setLaptops(laptopsRes.data as any);
      if (requestsRes.data) setRequests(requestsRes.data as any);

      if (revisionsRes.data) setEditRequests(revisionsRes.data as any);
      if (profilesRes.data) {
        setAllProfiles(profilesRes.data.map((p: any) => ({
          id: p.id,
          employeeId: p.employee_id,
          name: p.name,
          email: p.email,
          mobileNumber: p.mobile_number,
          role: p.role as UserRole,
          isApproved: p.is_approved
        })));
      }
    } catch (e: any) {
      console.warn("Registry search failed.");
    }
  };
  const clearStatusLater = (seconds: number = 3000) => {
    setTimeout(() => {
      setSignupStatus({ type: 'idle' }); // Or { type: 'idle' } depending on your types
    }, seconds);
  };
  //ledger search
  const handleLedgerSearch = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Try to find the request
    const found = requests.find(r =>
      r.id.toLowerCase() === trackingId.toLowerCase() ||
      r.employee_id.toLowerCase() === trackingId.toLowerCase()
    );

    if (found) {
      setTrackedRequest(found);
      setSearchError(false); // Success
    } else {
      setTrackedRequest(null);
      setSearchError(true);  // Trigger the error state
    }
  };
  // --- Auth Handlers ---
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupStatus({ type: 'loading' });
    if (signupForm.password !== signupForm.confirmPassword) {
      setSignupStatus({ type: 'error', message: "Identity Key Mismatch: Passwords do not match." });
      clearStatusLater(4000);
      return;
    }
    if (signupForm.mobileNumber.length !== 10) {
      setSignupStatus({ type: 'error', message: "Mobile Number must be exactly 10 digits." });
      clearStatusLater(4000);
      return;
    }
    try {
      const { count } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const isFirstUser = count === 0;

      const { data, error: authError } = await supabase.auth.signUp({
        email: signupForm.email,
        password: signupForm.password,
      });

      if (authError) throw authError;

      if (data.user) {
        const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id,
          name: signupForm.name,
          email: signupForm.email,
          employee_id: signupForm.employeeId,
          mobile_number: signupForm.mobileNumber,
          role: isFirstUser ? UserRole.ROOT : UserRole.ADMIN,
          is_approved: isFirstUser
        });

        if (profileError) throw profileError;
        setSignupForm({
          email: '',
          password: '',
          confirmPassword: '',
          name: '',
          employeeId: '',
          mobileNumber: ''
        });

        if (isFirstUser) {
          setSignupStatus({ type: 'success', message: "Identity Registered. Accessing Root Gateway..." });
          setTimeout(() => checkUser(true), 1500);
          clearStatusLater(2000);
        } else {
          // For regular admins, show a persistent success message. 
          // We don't call checkUser immediately to avoid the abrupt "kicked to sign-in" effect.
          setSignupStatus({
            type: 'success',
            message: "Application Transmitted. Awaiting Root Admin Clearance."

          });
          clearStatusLater(8000);
          // Explicitly sign out to ensure session is cleared locally for pending user
          await supabase.auth.signOut();
        }
      }
    } catch (err: any) {
      setSignupStatus({ type: 'error', message: err.message });
      clearStatusLater(2000);
    }
  };


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupStatus({ type: 'loading' });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (error) throw error;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
      if (profile && !profile.is_approved && profile.role !== UserRole.ROOT) {
        await supabase.auth.signOut();
        setSignupStatus({ type: 'error', message: "Access Denied: Awaiting clearance from Root Admin." });
        clearStatusLater(3000);
      } else {
        setLoginForm({ email: '', password: '' });
        setSignupStatus({ type: 'idle' });
        checkUser();
      }
    } catch (err: any) {
      setSignupStatus({ type: 'error', message: err.message });
      clearStatusLater(3000);
    }
  };
  const promoteToRoot = async (userId: string) => {
    if (confirm("PROMOTION: Elevate this admin to Root status? They will gain full system control.")) {
      await supabase.from('profiles').update({ role: UserRole.ROOT, is_approved: true }).eq('id', userId);
      fetchData();
    }
  };

  const demoteToAdmin = async (userId: string) => {
    if (confirm("DEMOTION: Revert this identity to Regular Admin status?")) {
      await supabase.from('profiles').update({ role: UserRole.ADMIN }).eq('id', userId);
      fetchData();
    }
  };
  const toggleApproval = async (userId: string, currentStatus: boolean) => {
    const action = currentStatus ? "SUSPEND" : "AUTHORIZE";
    if (confirm(`IDENTITY ACTION: ${action} access for this user?`)) {
      await supabase.from('profiles').update({ is_approved: !currentStatus }).eq('id', userId);
      fetchData();
    }
  };

  const removeUser = async (userId: string) => {
    if (confirm("PERMANENT REMOVAL: Delete this identity from the registry? This action cannot be undone.")) {
      await supabase.from('profiles').delete().eq('id', userId);
      fetchData();
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setAuthMode('user');
  };
  //CSV management function
  const parseCSVLine = (text: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };
  // --- 1. NEW CSV PROCESSING ENGINE ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = async (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const rows = text.split('\n').slice(1);
      const validLaptops: any[] = [];
      const rejected: { row: number; serial: string; data: string; reason: string }[] = [];
      const successful: { row: number; brand: string; model: string; serial: string; tag: string }[] = [];
      let totalProcessed = 0;

      // O(1) Local Duplicate Checker
      const existingSerials = new Set(laptops.map(l => l.serial_number?.toLowerCase()));

      rows.forEach((row, index) => {
        if (!row.trim()) return;
        totalProcessed++;

        const cols = parseCSVLine(row);
        const rowNumber = index + 2;

      // Error 1: Missing Columns
        if (cols.length < 6) {
          rejected.push({ row: rowNumber, serial: 'N/A', data: row.substring(0, 30) + '...', reason: 'Missing required columns' });
          return;
        }

        const brand = cols[0]?.trim();
        const model = cols[1]?.trim();
        const specs = cols[2]?.trim();
        const serial = cols[3]?.trim();
        const serviceId = cols[4]?.trim();
        const rawDate = cols[5]?.trim();

        // Error 2: Missing Critical Data
        if (!brand || !serial || !serviceId) {
          rejected.push({ row: rowNumber, serial: serial || 'N/A', data: `${brand || 'Missing Brand'} | Tag: ${serviceId || 'Missing'}`, reason: 'Missing Brand, Serial, or Tag ID' });
          return;
        }

        // Error 3: Duplicate Serial Number (Found in existing database)
        if (existingSerials.has(serial.toLowerCase())) {
          rejected.push({ row: rowNumber, serial: serial, data: `${brand} ${model || ''}`, reason: 'Duplicate Serial Number' });
          return;
        }

        let formattedDate = null;
        if (rawDate && rawDate.includes('-')) {
          const parts = rawDate.split('-');
          if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
        }

        // Add to valid list for DB
        validLaptops.push({ brand, model, specs, serial_number: serial, service_id: serviceId, purchase_date: formattedDate, status: LaptopStatus.AVAILABLE });
        
        // Add to success list for PDF
        successful.push({ row: rowNumber, brand, model, serial, tag: serviceId });
        
        // Block duplicates within the CSV itself
        existingSerials.add(serial.toLowerCase());
      });

      // --- BATCH UPLOAD LOGIC (5000 chunks) ---
      if (validLaptops.length > 0) {
        setIsLoading(true);
        const BATCH_SIZE = 5000;
        let hasError = false;

        for (let i = 0; i < validLaptops.length; i += BATCH_SIZE) {
          const batch = validLaptops.slice(i, i + BATCH_SIZE);
          const { error } = await supabase.from('laptops').insert(batch);
          if (error) {
            alert(`Upload halted at row ${i}: ${error.message}`);
            hasError = true;
            break;
          }
        }

        setIsLoading(false);
        if (!hasError) fetchData();
      }

      // Show Report Modal
      setImportReport({ total: totalProcessed, successCount: validLaptops.length, rejected, successful });
      event.target.value = '';
    };

    reader.readAsText(file);
  };

  // --- 2. ENTERPRISE PDF GENERATOR ---
  const downloadImportReportPDF = () => {
    if (!importReport) return;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const reportId = `REP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleString();
    const adminName = currentUser?.name || 'System Admin';

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text("NEXUS IT | ENTERPRISE ERP", 14, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("ASSET REGISTRY: BULK IMPORT AUDIT REPORT", 14, 27);

    // Summary
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`Report ID: ${reportId}`, 14, 40);
    doc.text(`Date Generated: ${dateStr}`, 14, 45);
    doc.text(`Authorized Admin: ${adminName}`, 14, 50);

    doc.setFont("helvetica", "bold");
    doc.text("EXECUTIVE SUMMARY", 14, 60);
    doc.setFont("helvetica", "normal");
    doc.text(`Total Rows Processed: ${importReport.total}`, 14, 66);
    doc.setTextColor(16, 185, 129);
    doc.text(`Successfully Imported: ${importReport.successCount} (Written to live inventory)`, 14, 71);
    doc.setTextColor(244, 63, 94);
    doc.text(`Rejected Rows: ${importReport.rejected.length} (Requires manual correction)`, 14, 76);

    let finalY = 85;

    // Failures Table
    if (importReport.rejected.length > 0) {
      autoTable(doc, {
        startY: finalY,
        head: [["CSV Row", "Rejection Reason", "Asset Data Snippet"]],
        body: importReport.rejected.map(r => [r.row.toString(), r.reason, r.data]),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2, textColor: [40, 40, 40] },
        headStyles: { fillColor: [244, 63, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { top: 20, bottom: 20 },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text(`Nexus IT Audit Report | ID: ${reportId} | Page ${doc.internal.getNumberOfPages()}`, 14, 10);
          }
        }
      });
      // @ts-ignore
      finalY = doc.lastAutoTable.finalY + 15;
    }

    // Successes Table
    if (importReport.successful.length > 0) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      if (finalY > 260) { doc.addPage(); finalY = 20; }
      
      doc.text("PART 2: SUCCESS LEDGER (IMPORTED ASSETS)", 14, finalY);
      finalY += 5;

      autoTable(doc, {
        startY: finalY,
        head: [["CSV Row", "Unit Identity", "Serial Number", "Service Tag"]],
        body: importReport.successful.map(s => [s.row.toString(), `${s.brand} ${s.model}`, s.serial, s.tag]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 1.5, textColor: [40, 40, 40] },
        headStyles: { fillColor: [44, 44, 44], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 20, bottom: 20 },
        didDrawPage: (data) => {
          doc.setFontSize(8); doc.setTextColor(150);
          doc.text(`Nexus IT Audit Report | ID: ${reportId} | Page ${doc.internal.getNumberOfPages()}`, 14, 10);
        }
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150);
      doc.text(`End of Report | Strict Confidentiality Applied.`, 14, 285);
    }

    doc.save(`Nexus_Import_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
  };
  // --- Management Handlers ---
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    await supabase.from('laptop_requests').insert({
      id,
      employee_id: userRequestForm.employeeId,
      employee_name: userRequestForm.name,
      type: userRequestForm.type,
      reason: userRequestForm.reason,
      status: RequestStatus.PENDING,
      return_date: userRequestForm.returnDate || null
    });
    alert(`Request Transmitted: ${id}`);
    setUserRequestForm({ employeeId: '', name: '', type: RequestType.PERMANENT, reason: '', returnDate: '' });
    fetchData();
  };

  const handleAddLaptop = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('laptops').insert({
      brand: newLaptop.brand,
      model: newLaptop.model,
      serial_number: newLaptop.serialNumber,
      service_id: newLaptop.serviceId,
      specs: newLaptop.specs,
      purchase_date: newLaptop.purchaseDate,
      status: LaptopStatus.AVAILABLE
    });
    closeAddLaptopModal();
    fetchData();
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLaptop) return;

    // 1. Capture the NEW values from the form
    const newValues = {
      brand: editingLaptop.brand,
      model: editingLaptop.model,
      serial_number: editingLaptop.serial_number,
      service_id: editingLaptop.service_id,
      specs: editingLaptop.specs
    };

    // 2. Capture the OLD values (The current state of the laptop in the DB)
    // We find the original object from the 'laptops' state to ensure it's the "before" snapshot
    const originalLaptop = laptops.find(l => l.id === editingLaptop.id);
    const oldValues = originalLaptop ? {
      brand: originalLaptop.brand,
      model: originalLaptop.model,
      serial_number: originalLaptop.serial_number,
      service_id: originalLaptop.service_id,
      specs: originalLaptop.specs
    } : null;

    const { error } = await supabase.from('laptop_edit_requests').insert({
      laptop_id: editingLaptop.id,
      proposed_by: currentUser?.name,
      new_values: newValues,
      old_values: oldValues,
      status: 'PENDING'
    });

    if (error) {
      alert("Error submitting revision: " + error.message);
    } else {
      alert("Revision Proposal Submitted to Queue.");
    }
    setEditingLaptop(null);
    fetchData();
  };
  const approveRequest = async (id: string) => {
    await supabase.from('laptop_requests').update({ status: RequestStatus.APPROVED, approved_by: currentUser?.name }).eq('id', id);
    fetchData();
  };

  const rejectRequest = async (id: string) => {
    await supabase.from('laptop_requests').update({ status: RequestStatus.REJECTED }).eq('id', id);
    fetchData();
  };

  const deployAsset = async (reqId: string, laptopId: string) => {
    // 1. Find the Request and the Laptop objects
    const req = requests.find(r => r.id === reqId);
    const laptop = laptops.find(l => l.id === laptopId);

    if (!req || !laptop) return;

    // 2. CONFIRMATION STEP (Similar to Return)
    const message = `Confirm assignment of asset:\n\nUnit: ${laptop.brand} ${laptop.model}\nTag: ${laptop.service_id}\n\nTo User: ${req.employee_name}?`;

    if (confirm(message)) {
      try {
        // Robust ID check (Safety from previous fix)
        const userEmployeeId = (req as any).employee_id || (req as any).employeeId;

        if (!userEmployeeId) {
          alert("Error: Employee ID is missing on this request.");
          return;
        }

        // 3. Update Request Table
        const { error: reqError } = await supabase.from('laptop_requests').update({
          status: RequestStatus.ASSIGNED,
          assigned_laptop_id: laptopId,
          assigned_at: new Date().toISOString()
        }).eq('id', reqId);

        if (reqError) throw reqError;

        // 4. Update Laptop Table
        const { error: laptopError } = await supabase.from('laptops').update({
          status: LaptopStatus.ASSIGNED,
          last_assigned_to: userEmployeeId
        }).eq('id', laptopId);

        if (laptopError) throw laptopError;

        // 5. Success
        setAssigningToRequest(null);
        alert(`Asset successfully deployed to ${req.employee_name}.`);
        fetchData();

      } catch (error: any) {
        alert("Deployment Failed: " + error.message);
      }
    }
  };

  const returnAsset = async (reqId: string) => {
    const req = requests.find(r => r.id === reqId);
    if (!req || !req.assigned_laptop_id) return;

    if (confirm(`Confirm return of asset ${req.assigned_laptop_id} from ${req.employee_name}?`)) {
      try {
        await supabase.from('laptop_requests').update({ status: RequestStatus.RETURNED, return_approved_by: currentUser?.name, actual_return_date: new Date().toISOString() }).eq('id', reqId);
        await supabase.from('laptops').update({ status: LaptopStatus.AVAILABLE, last_assigned_to: null }).eq('id', req.assigned_laptop_id);
        alert("Asset successfully returned to inventory.");
        fetchData();
      } catch (err) {
        alert("Error returning asset. Please try again.");
      }
    }
  };

  const scrapAsset = async (laptopId: string) => {
    const laptop = laptops.find(l => l.id === laptopId);
    const msg = laptop?.status === LaptopStatus.ASSIGNED
      ? "Warning: This asset is currently ASSIGNED. Decommissioning it will retire the hardware immediately. Continue?"
      : "Decommission this laptop?";

    if (confirm(msg)) {
      const { error } = await supabase.from('laptops').update({ status: LaptopStatus.SCRAP }).eq('id', laptopId);
      if (error) {
        alert("Error decommissioning laptop: " + error.message);
      } else {
        alert("Laptop successfully decommissioned.");
        fetchData();
      }
    }
  };

  const activateIdentity = async (profileId: string) => {
    await supabase.from('profiles').update({ is_approved: true }).eq('id', profileId);
    fetchData();
  };

  const processRevision = async (revId: string, approve: boolean) => {
    const rev = editRequests.find(r => r.id === revId);
    if (!rev) return;

    const reviewerName = currentUser?.name || 'Unknown Admin';

    if (approve) {
      await supabase.from('laptops').update(rev.new_values).eq('id', rev.laptop_id);
      await supabase.from('laptop_edit_requests').update({
        status: 'APPROVED',
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString()
      }).eq('id', revId);
    } else {
      // Ask for a reason
      const reason = prompt("Please enter a reason for rejection:");
      if (reason === null) return; // Cancel if they clicked Cancel

      await supabase.from('laptop_edit_requests').update({
        status: 'REJECTED',
        reviewed_by: reviewerName,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason // <--- Saving the reason
      }).eq('id', revId);
    }
    fetchData();
  };
  const getAssignedLaptopDetails = (laptopId?: string) => {
    if (!laptopId) return null;
    return laptops.find(l => l.id === laptopId);
  };

  if (dbError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] p-8">
        <div className="max-w-xl w-full bg-white p-16 rounded-[48px] border-2 border-dashed border-rose-200 text-center shadow-xl">
          <Icons.Alert className="w-10 h-10 text-rose-500 mx-auto mb-8" />
          <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight uppercase">Database Nexus Offline</h2>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFBF7]">
        <Icons.History className="w-12 h-12 animate-spin text-slate-900 mb-6" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">Syncing Nexus Registry</p>
      </div>
    );
  }

  if (!currentUser) {
    if (authMode === 'user') {
      return (
        <div className="min-h-screen bg-[#FDFBF7] p-8 lg:p-20 flex flex-col font-inter">
          <div className="max-w-7xl mx-auto w-full">
            <header className="flex justify-between items-center mb-24">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 bg-[#2C2C2C] rounded-[24px] flex items-center justify-center text-white shadow-2xl rotate-3"><Icons.Laptop className="w-9 h-9" /></div>
                <div><h1 className="text-3xl font-black text-slate-900 tracking-tight">Nexus IT</h1><p className="text-slate-400 text-xs font-bold uppercase tracking-[0.3em] mt-1">Resource Planning</p></div>
              </div>
              <button onClick={() => setAuthMode('signin')} className="px-10 py-4 bg-white border border-[#EAE3D5] rounded-full text-slate-600 text-sm font-black hover:shadow-xl transition-all">Admin Gateway</button>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-start">
              <div className="lg:col-span-7 bg-white rounded-[48px] p-12 border border-[#EAE3D5] shadow-sm">
                <h2 className="text-4xl font-black mb-12 text-slate-900">Laptop Application</h2>
                <form onSubmit={handleUserSubmit} className="space-y-10">
                  <div className="grid grid-cols-2 gap-8">
                    <div><label className={labelClass}>Corporate ID</label><input required placeholder="EMP-XXXX" className={inputClass} value={userRequestForm.employeeId} onChange={e => setUserRequestForm({ ...userRequestForm, employeeId: e.target.value })} /></div>
                    <div><label className={labelClass}>Authorized Name</label><input required placeholder="James Sterling" className={inputClass} value={userRequestForm.name} onChange={e => setUserRequestForm({ ...userRequestForm, name: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {[RequestType.PERMANENT, RequestType.TEMPORARY, RequestType.REPLACEMENT].map(t => (
                      <button key={t} type="button" onClick={() => setUserRequestForm({ ...userRequestForm, type: t })} className={`py-4 rounded-3xl text-[10px] font-black tracking-widest border transition-all ${userRequestForm.type === t ? 'bg-[#2C2C2C] text-white border-transparent' : 'bg-[#F9F6F0] text-slate-400 border-[#EAE3D5]'}`}>{t}</button>
                    ))}
                  </div>
                  {userRequestForm.type === RequestType.TEMPORARY && <div><label className={labelClass}>Return Date</label><input type="date" required className={inputClass} value={userRequestForm.returnDate} onChange={e => setUserRequestForm({ ...userRequestForm, returnDate: e.target.value })} /></div>}
                  <div><label className={labelClass}>Justification</label><textarea required rows={4} placeholder="Business rationale..." className={inputClass} value={userRequestForm.reason} onChange={e => setUserRequestForm({ ...userRequestForm, reason: e.target.value })} /></div>
                  <button className="w-full py-6 bg-[#2C2C2C] text-white font-black rounded-[32px] shadow-2xl hover:bg-black transition-all uppercase text-sm tracking-widest">Transmit Request</button>
                </form>
              </div>
              <div className="lg:col-span-5 bg-[#2C2C2C] rounded-[48px] p-12 text-white shadow-2xl">
                <h3 className="text-2xl font-black mb-8 tracking-tight">Ledger Tracking</h3>
                <form onSubmit={(e) => { e.preventDefault(); const found = requests.find(r => r.id === trackingId || r.employee_id === trackingId); setTrackedRequest(found || null); }} className="relative mb-8">
                  <input placeholder="Employee Id" className="w-full px-8 py-5 rounded-[24px] bg-white/10 border border-white/20 text-white placeholder:text-white/30 text-sm outline-none" value={trackingId} onChange={e => {
                    setTrackingId(e.target.value);
                    setSearchError(false); // <--- Clear error as soon as they type
                    if (e.target.value === '') setTrackedRequest(null);
                  }} />
                  {trackingId && (
                    <button
                      type="button"
                      onClick={() => { setTrackingId(''); setTrackedRequest(null); }}
                      // changed: Added padding, rounded-full background on hover, and smooth transition
                      className="absolute right-14 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200"
                      title="Clear Search"
                    >
                      {/* changed: Fixed the w-7 h-3 distortion to a square w-4 h-4 */}
                      <Icons.X className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={handleLedgerSearch} className="absolute right-3 top-3 p-3 bg-white text-black rounded-2xl hover:scale-105 transition-all"><Icons.History className="w-5 h-5" /></button>
                </form>
                {trackedRequest ? (
                  // --- SUCCESS STATE ---
                  <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 animate-fadeIn">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-black text-xl">{trackedRequest.id}</h4>
                      <StatusBadge status={trackedRequest.status} />
                    </div>
                    <p className="text-xs font-bold text-white/40">Custodian: {trackedRequest.employee_name}</p>
                  </div>
                ) : searchError ? (
                  // --- ERROR STATE (Wrong ID) ---
                  <div className="py-12 text-center border-2 border-dashed border-rose-500/30 bg-rose-500/10 rounded-[32px] animate-pulse">
                    <Icons.Alert className="w-8 h-8 text-rose-400 mx-auto mb-3" />
                    <p className="text-rose-300 font-black uppercase text-[10px] tracking-widest">
                      Identity Not Found
                    </p>
                    <p className="text-rose-400/60 text-[9px] font-bold mt-1">
                      Check Employee ID or Serial
                    </p>
                  </div>
                ) : (
                  // --- IDLE STATE (Before Search) ---
                  <div className="py-12 text-center text-white/20 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-white/10 rounded-[32px]">
                    No Active Query
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] px-4">
        <div className="relative
      w-full
      max-w-[440px]
      bg-white
      p-8 sm:p-10
      rounded-[32px]
      border border-[#EAE3D5]
      shadow-2xl">
          <button onClick={() => setAuthMode('user')} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900"><Icons.X className="w-8 h-8" /></button>
          <div className="text-center mb-14">
            <div className="w-24 h-24 bg-[#2C2C2C] rounded-[32px] flex items-center justify-center mx-auto mb-8 text-white shadow-2xl rotate-3"><Icons.Users className="w-12 h-12" /></div>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">{authMode === 'signin' ? 'System Auth' : 'Admin Application'}</h2>
          </div>
          {signupStatus.type === 'error' && <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-black uppercase tracking-widest">{signupStatus.message}</div>}
          {signupStatus.type === 'success' && <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest">{signupStatus.message}</div>}
          {authMode === 'signin' ? (
            <form onSubmit={handleSignIn} className="space-y-8">
              <div><label className={labelClass}>User Email</label><input name="email" type="email" required className={inputClass} value={loginForm.email} onChange={e => setLoginForm({ ...loginForm, email: e.target.value })} /></div>
              <div><label className={labelClass}>Credential Key</label><input name="password" type="password" required className={inputClass} value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} /></div>
              <button className="w-full py-6 bg-[#2C2C2C] text-white font-black rounded-[32px] shadow-2xl hover:bg-black transition-all uppercase text-sm tracking-widest">Authorize Access</button>
              <p className="text-center text-[10px] text-slate-400 font-bold mt-6">Missing access? <button onClick={() => setAuthMode('signup')} className="text-slate-900 underline">Apply for Admin Role</button></p>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className={labelClass}>Full Name</label><input type="text" required className={inputClass} value={signupForm.name} onChange={e => setSignupForm({ ...signupForm, name: e.target.value })} /></div>
                <div><label className={labelClass}>Employee ID</label><input required className={inputClass} value={signupForm.employeeId} onChange={e => setSignupForm({ ...signupForm, employeeId: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Email</label><input type="email" required className={inputClass} value={signupForm.email} onChange={e => setSignupForm({ ...signupForm, email: e.target.value })} /></div>
                <div>
                  <label className={labelClass}>Mobile Number</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder=" "
                    className={inputClass}
                    value={signupForm.mobileNumber}
                    onChange={(e) => {
                      // 1. Strip out anything that is NOT a number
                      const onlyNums = e.target.value.replace(/\D/g, '');

                      // 2. Only update state if length is 10 or less
                      if (onlyNums.length <= 10) {
                        setSignupForm({ ...signupForm, mobileNumber: onlyNums });
                      }
                    }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className={labelClass}>Create Key</label><input type="password" required className={inputClass} value={signupForm.password} onChange={e => setSignupForm({ ...signupForm, password: e.target.value })} /></div>
                <div><label className={labelClass}>Confirm Key</label><input type="password" required className={inputClass} value={signupForm.confirmPassword} onChange={e => setSignupForm({ ...signupForm, confirmPassword: e.target.value })} /></div>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center"><p className="text-[8px] font-black uppercase text-amber-700 tracking-widest">Note: All new identities default to Regular Admin status and require Root clearance.</p></div>
              <button disabled={signupStatus.type === 'loading'} className="w-full py-4 bg-[#2C2C2C] text-white font-black rounded-2xl shadow-xl hover:bg-black transition-all uppercase text-[10px] tracking-widest disabled:opacity-50">Transmit Enlistment</button>
              <p className="text-center text-[10px] text-slate-400 font-bold mt-6">Already enlisted? <button onClick={() => setAuthMode('signin')} className="text-slate-900 underline">Sign In</button></p>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <Layout user={currentUser} onLogout={handleSignOut} activeTab={activeTab} setActiveTab={setActiveTab}>

      {activeTab === 'dashboard' && (
        <div className="space-y-16 animate-fadeIn">
          <header><h2 className="text-5xl font-black text-slate-900 tracking-tight">Enterprise Metrics</h2></header>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <MetricCard title="Total Inventory" value={(stats.totalLaptops - stats.scrappedLaptops)} icon={Icons.Laptop} />
            <MetricCard title="Active Pool" value={stats.availableLaptops} icon={Icons.Check} trendUp trend="Live" />
            <MetricCard title="Open Requests" value={stats.pendingRequests} icon={Icons.Clipboard} />
            <MetricCard title="Temporary Loans" value={stats.activeLoans} icon={Icons.History} />
          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-6 animate-fadeIn">
          <h2 className="text-2xl font-black text-slate-900">Deployment Queue</h2>

          {/* --- DETAILS MODAL (Pop-up) --- */}
          {viewingRequest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-2xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">

                {/* Modal Header */}
                <div className="bg-[#FDFBF7] px-8 py-6 border-b border-[#EAE3D5] flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-900 font-black border border-[#EAE3D5]">
                      {viewingRequest.employee_name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-slate-900">{viewingRequest.employee_name}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{viewingRequest.id}</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingRequest(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Icons.X className="w-5 h-5 text-slate-400" /></button>
                </div>

                {/* Modal Body: The "Details Table" */}
                <div className="p-8 space-y-6">

                  {/* Section 1: Justification */}
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Request Justification</h4>
                    <p className="text-sm font-medium text-slate-700 italic">"{viewingRequest.reason || 'No justification provided.'}"</p>
                  </div>

                  {/* Section 2: Approval Chain */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-[#EAE3D5] rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3 text-emerald-600">
                        <Icons.Check className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Authorized By</span>
                      </div>
                      <p className="font-bold text-slate-900">{viewingRequest.approved_by || "Pending"}</p>
                      {viewingRequest.assigned_at ? (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Assigned: {new Date(viewingRequest.assigned_at).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Not yet assigned</p>
                      )}
                    </div>

                    <div className="border border-[#EAE3D5] rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3 text-amber-600">
                        <Icons.History className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Returned By</span>
                      </div>
                      <p className="font-bold text-slate-900">{viewingRequest.return_approved_by || "N/A"}</p>
                      {/* Show Actual Return Date if available */}
                      {viewingRequest.actual_return_date ? (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Returned: {new Date(viewingRequest.actual_return_date).toLocaleDateString()}
                        </p>
                      ) : (
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Still Active / N/A</p>
                      )}
                    </div>
                  </div>

                </div>

                {/* Modal Footer */}
                <div className="bg-slate-50 px-8 py-4 border-t border-[#EAE3D5] text-right">
                  <button onClick={() => setViewingRequest(null)} className="px-6 py-2 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">Close Details</button>
                </div>
              </div>
            </div>
          )}

          {/* --- MAIN TABLE (Cleaned) --- */}
          <div className="bg-white rounded-2xl border border-[#EAE3D5] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-[#F9F6F0] text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Assigned Unit</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE3D5]">
                {requests.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">Registry Clear</td></tr>
                ) : requests
                    .filter(r => r.status !== RequestStatus.RETURNED)
                    .map(req => {
                  const assignedLaptop = getAssignedLaptopDetails(req.assigned_laptop_id);
                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-bold text-xs text-slate-900">{req.employee_name}</p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">{req.id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[9px] font-black uppercase px-2 py-1 bg-slate-100 rounded text-slate-500">{req.type}</span>
                      </td>
                      <td className="px-4 py-3">
                        {assignedLaptop ? (
                          <div className="leading-tight">
                            <p className="text-[10px] font-bold text-slate-800">{assignedLaptop.brand} {assignedLaptop.model}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{assignedLaptop.service_id}</p>
                          </div>
                        ) : <span className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">N/A</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={req.status} /></td>

                      {/* CONTROLS COLUMN */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end items-center gap-2">

                          {/* "View Details" Button (Eye Icon) */}
                          <button
                            onClick={() => setViewingRequest(req)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="View Full Details"
                          >
                            <Icons.Clipboard className="w-4 h-4" />
                          </button>

                          <div className="w-px h-4 bg-slate-200 mx-1"></div> {/* Separator */}

                          {/* Action Buttons */}
                          {currentUser.role === UserRole.ROOT && req.status === RequestStatus.PENDING && (
                            <>
                              <button onClick={() => approveRequest(req.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"><Icons.Check className="w-4 h-4" /></button>
                              <button onClick={() => rejectRequest(req.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"><Icons.X className="w-4 h-4" /></button>
                            </>
                          )}
                          {req.status === RequestStatus.APPROVED && (
                            <button onClick={() => { setActiveTab('inventory'); setAssigningToRequest(req.id); }} className="px-2 py-1 bg-[#2C2C2C] text-white text-[9px] font-black rounded hover:bg-black uppercase">Deploy</button>
                          )}
                          {currentUser.role === UserRole.ROOT && req.status === RequestStatus.ASSIGNED && (
                            <button onClick={() => returnAsset(req.id)} className="px-2 py-1 bg-white border border-slate-200 text-slate-600 text-[9px] font-black rounded hover:bg-slate-50 uppercase">Return</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'loans' && (
        <div className="space-y-12 animate-fadeIn">
          <h2 className="text-4xl font-black text-slate-900">Active Temporary Loans</h2>
          <div className="bg-white rounded-[48px] border border-[#EAE3D5] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-[#F9F6F0] text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-12 py-10">Custodian</th>
                  <th className="px-6 py-4">Loan Details</th>
                  <th className="px-12 py-10">Assigned Unit</th>
                  <th className="px-12 py-10">Expiry Date</th>
                  <th className="px-12 py-10 text-right">Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE3D5]">
                {requests.filter(r => r.status === RequestStatus.ASSIGNED && r.type === RequestType.TEMPORARY).length === 0 ? (
                  <tr><td colSpan={4} className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">No Active Loans</td></tr>
                ) : requests.filter(r => r.status === RequestStatus.ASSIGNED && r.type === RequestType.TEMPORARY).map(req => {
                  const assignedLaptop = getAssignedLaptopDetails(req.assigned_laptop_id);
                  const isExpired = req.return_date ? new Date(req.return_date) < new Date() : false;
                  return (
                    <tr key={req.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-12 py-8"><p className="font-black text-slate-900">{req.employee_name}</p><p className="text-[10px] text-slate-400 uppercase tracking-widest">{req.employee_id}</p></td>
                      <td className="px-6 py-4 max-w-[200px]">
                        <p className="text-[10px] text-slate-500 font-medium truncate mb-1" title={req.reason}>"{req.reason}"</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auth: {req.approved_by || 'N/A'}</p>
                      </td>
                      <td className="px-12 py-8">
                        {assignedLaptop ? (
                          <div className="space-y-1">
                            <p className="text-xs font-black text-slate-800">{assignedLaptop.brand} {assignedLaptop.model}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{assignedLaptop.service_id}</p>
                          </div>
                        ) : <span className="text-rose-500 font-bold">Unmapped Asset</span>}
                      </td>
                      <td className="px-12 py-8">
                        <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${isExpired ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                          {req.return_date || 'N/A'} {isExpired && '(EXPIRED)'}
                        </span>
                      </td>
                      <td className="px-12 py-8 text-right">
                        <button onClick={() => returnAsset(req.id)} className="px-4 py-2 bg-[#2C2C2C] text-white text-[10px] font-black rounded-lg uppercase tracking-widest hover:bg-emerald-600 transition-colors">Accept Return</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="space-y-12 animate-fadeIn">

          {/* --- HEADER --- */}
          <header className="flex justify-between items-center">
            <div>
              <h2 className="text-4xl font-black text-slate-900">Asset Registry</h2>
              {/* FIX: Count only Non-Scrap Laptops for the "Total" number */}
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Showing {filteredLaptops.length} of {laptops.filter(l => l.status !== LaptopStatus.SCRAP).length} Active Assets
              </p>
            </div>
            {currentUser.role === UserRole.ROOT && (
              <div className="flex items-center gap-4">

                {/* 1. Hidden File Input for CSV */}
                <input
                  type="file"
                  accept=".csv"
                  id="csvInput"
                  className="hidden"
                  onChange={handleFileUpload}
                />

                {/* 2. Import CSV Button (Triggers the hidden input) */}
                <button
                  onClick={() => document.getElementById('csvInput')?.click()}
                  className="px-6 py-4 bg-white border border-[#EAE3D5] text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2"
                >
                  <Icons.Clipboard className="w-4 h-4 text-slate-400" />
                  Import CSV
                </button>

                <button onClick={() => setIsAddingLaptop(true)} className="px-8 py-4 bg-[#2C2C2C] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">Add Laptop</button>
              </div>
            )}
          </header>

          {/* --- CONTROL CENTER --- */}
          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col md:flex-row gap-4">

            {/* Search Input */}
            <div className="relative flex-1">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                placeholder="Search"
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters */}
            <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0">
              {/* BRAND FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                <option value="ALL">All Brands</option>
                {Array.from(new Set(laptops.map(l => l.brand))).map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              {/* STATUS FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value={LaptopStatus.AVAILABLE}>Available</option>
                <option value={LaptopStatus.ASSIGNED}>Assigned</option>

              </select>

              {/* RAM FILTER - Comprehensive List */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterRam} onChange={e => setFilterRam(e.target.value)}>
                <option value="ALL">RAM</option>
                <option value="4GB">4 GB</option>
                <option value="8GB">8 GB</option>
                <option value="12GB">12 GB</option>
                <option value="16GB">16 GB</option>
                <option value="24GB">24 GB</option>
                <option value="32GB">32 GB</option>
                <option value="64GB">64 GB</option>
              </select>

              {/* STORAGE FILTER - Comprehensive List */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterStorage} onChange={e => setFilterStorage(e.target.value)}>
                <option value="ALL">Disk</option>
                <option value="128GB">128 GB</option>
                <option value="256GB">256 GB</option>
                <option value="512GB">512 GB</option>
                <option value="1TB">1 TB</option>
                <option value="2TB">2 TB</option>
              </select>

              {/* CPU FILTER - Intel / Apple / AMD */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterCpu} onChange={e => setFilterCpu(e.target.value)}>
                <option value="ALL">CPU</option>
                {/* Apple Silicon */}
                <option value="M1">Apple M1</option>
                <option value="M2">Apple M2</option>
                <option value="M3">Apple M3</option>
                {/* Intel Core */}
                <option value="i3">Intel i3</option>
                <option value="i5">Intel i5</option>
                <option value="i7">Intel i7</option>
                <option value="i9">Intel i9</option>
                <option value="Xeon">Intel Xeon</option>
                {/* AMD Ryzen */}
                <option value="Ryzen 3">Ryzen 3</option>
                <option value="Ryzen 5">Ryzen 5</option>
                <option value="Ryzen 7">Ryzen 7</option>
                <option value="Ryzen 9">Ryzen 9</option>
              </select>
            </div>
          </div>
          {/* --- EXISTING MODALS (Keep exactly as they were) --- */}
          {editingLaptop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-8">
              <div className="bg-white w-full max-w-2xl p-12 rounded-[56px] border border-[#EAE3D5] shadow-2xl relative animate-fadeInDown">
                <button onClick={() => setEditingLaptop(null)} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900"><Icons.X className="w-8 h-8" /></button>
                <h3 className="text-3xl font-black mb-8 text-slate-900">Asset Revision</h3>
                <form onSubmit={handleEditSubmit} className="grid grid-cols-2 gap-6">
                  <div><label className={labelClass}>Brand</label><input required className={inputClass} value={editingLaptop.brand} onChange={e => setEditingLaptop({ ...editingLaptop, brand: e.target.value })} /></div>
                  <div><label className={labelClass}>Model</label><input required className={inputClass} value={editingLaptop.model} onChange={e => setEditingLaptop({ ...editingLaptop, model: e.target.value })} /></div>
                  <div><label className={labelClass}>Serial</label><input required className={inputClass} value={editingLaptop.serial_number} onChange={e => setEditingLaptop({ ...editingLaptop, serial_number: e.target.value })} /></div>
                  <div><label className={labelClass}>Tag ID</label><input required className={inputClass} value={editingLaptop.service_id} onChange={e => setEditingLaptop({ ...editingLaptop, service_id: e.target.value })} /></div>
                  <div className="col-span-2"><label className={labelClass}>Specifications</label><textarea required rows={3} className={inputClass} value={editingLaptop.specs} onChange={e => setEditingLaptop({ ...editingLaptop, specs: e.target.value })} /></div>
                  <div className="col-span-2 flex gap-4 mt-4">
                    <button type="button" onClick={() => setEditingLaptop(null)} className="flex-1 font-bold text-slate-400">Abort Changes</button>
                    <button className="flex-1 py-4 bg-[#2C2C2C] text-white rounded-3xl font-black shadow-xl uppercase tracking-widest text-xs">Commit Revision</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {isAddingLaptop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
              style={{ backgroundColor: '#eae3d508', backdropFilter: 'blur(1px)' }}>
              <div className="bg-white w-full max-w-2xl p-12 rounded-[48px] border border-[#EAE3D5] shadow-2xl relative animate-fadeInDown">

                {/* Close Button */}
                <button
                  onClick={closeAddLaptopModal}
                  className="absolute top-10 right-10 text-slate-300 hover:text-slate-900 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>

                <h3 className="text-2xl font-black mb-8 text-slate-900">Asset Registration</h3>

                <form onSubmit={handleAddLaptop} className="grid grid-cols-2 gap-6">
                  <input required placeholder="Brand" className={inputClass} value={newLaptop.brand} onChange={e => setNewLaptop({ ...newLaptop, brand: e.target.value })} />
                  <input required placeholder="Model" className={inputClass} value={newLaptop.model} onChange={e => setNewLaptop({ ...newLaptop, model: e.target.value })} />
                  <input required placeholder="Serial" className={inputClass} value={newLaptop.serialNumber} onChange={e => setNewLaptop({ ...newLaptop, serialNumber: e.target.value })} />
                  <input required placeholder="Tag ID" className={inputClass} value={newLaptop.serviceId} onChange={e => setNewLaptop({ ...newLaptop, serviceId: e.target.value })} />
                  <input required placeholder="Specifications" className={`${inputClass} col-span-2`} value={newLaptop.specs} onChange={e => setNewLaptop({ ...newLaptop, specs: e.target.value })} />
                  <div className="col-span-2">
                    <label className={labelClass}>Purchase Date</label>
                    <input required
                      type="date"
                      className={inputClass}
                      value={newLaptop.purchaseDate}
                      onChange={e => setNewLaptop({ ...newLaptop, purchaseDate: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 flex gap-4 mt-2">
                    <button type="button" onClick={closeAddLaptopModal} className="flex-1 font-bold text-slate-400">Cancel</button>
                    <button className="flex-1 py-4 bg-[#2C2C2C] text-white rounded-2xl font-black shadow-xl uppercase tracking-widest text-xs">Confirm Entry</button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {/* --- IMPORT REPORT MODAL --- */}
          {importReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
                 style={{ backgroundColor: '#eae3d508', backdropFilter: 'blur(2px)' }}>
              <div className="bg-white w-full max-w-2xl rounded-[48px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-[#FDFBF7] px-10 py-8 border-b border-[#EAE3D5] flex justify-between items-center shrink-0">
                  <div>
                    <h3 className="font-black text-2xl text-slate-900">Import Complete</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">System Audit Summary</p>
                  </div>
                  <button onClick={() => setImportReport(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Icons.X className="w-6 h-6 text-slate-400" /></button>
                </div>

                {/* Body (Scrollable) */}
                <div className="p-10 overflow-y-auto space-y-8">
                  
                  {/* Stat Blocks */}
                  <div className="grid grid-cols-3 gap-6">
                    <div className="bg-slate-50 border border-slate-200 p-6 rounded-3xl text-center">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Processed</p>
                      <p className="text-3xl font-black text-slate-900">{importReport.total}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl text-center">
                      <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest mb-2">Success</p>
                      <p className="text-3xl font-black text-emerald-700">{importReport.successCount}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl text-center">
                      <p className="text-[10px] font-black uppercase text-rose-600 tracking-widest mb-2">Rejected</p>
                      <p className="text-3xl font-black text-rose-700">{importReport.rejected.length}</p>
                    </div>
                  </div>

                {/* Rejected List (Preview) */}
                  {importReport.rejected.length > 0 && (
                    <div className="mt-8">
                      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-4">Rejection Log Preview</h4>
                      <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                        {importReport.rejected.map((rej, i) => (
                          <div key={i} className="flex gap-4 p-4 bg-white border border-rose-100 rounded-2xl items-center shadow-sm">
                            <span className="px-3 py-1.5 bg-rose-100 text-rose-700 text-[10px] font-black rounded-lg uppercase whitespace-nowrap">Row {rej.row}</span>
                            
                            {/* 👇 The new Serial Number column */}
                            <span className="text-xs font-black text-slate-900 w-1/4 truncate" title={rej.serial}>
                              {rej.serial}
                            </span>
                            
                            <span className="text-xs font-bold text-rose-600 w-1/3 truncate" title={rej.reason}>
                              {rej.reason}
                            </span>
                            
                            <span className="text-xs text-slate-400 truncate w-1/3" title={rej.data}>
                              {rej.data}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="bg-slate-50 px-10 py-6 border-t border-[#EAE3D5] flex justify-between items-center shrink-0">
                  <button 
                    onClick={downloadImportReportPDF}
                    className="flex items-center gap-3 px-8 py-4 bg-[#2C2C2C] text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all shadow-xl hover:shadow-2xl"
                  >
                    <Icons.Clipboard className="w-5 h-5" />
                    Download PDF Report
                  </button>
                  <button onClick={() => setImportReport(null)} className="px-8 py-4 bg-white border border-[#EAE3D5] rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 text-slate-600 transition-colors">Acknowledge</button>
                </div>

              </div>
            </div>
          )}

          {assigningToRequest && <div className="p-6 bg-emerald-600 text-white rounded-3xl flex justify-between items-center mb-8 animate-pulse shadow-xl shadow-emerald-100"><span className="font-black uppercase text-[10px] tracking-widest">Select physical unit for {assigningToRequest}</span><button onClick={() => setAssigningToRequest(null)} className="font-black text-[10px] uppercase underline">Abort Deployment</button></div>}

          {/* --- MAIN TABLE --- */}
          <div className="bg-white rounded-[32px] border border-[#EAE3D5] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F9F6F0] text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    {/* UNIT COLUMN */}
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap w-px">
                      Asset Identity
                    </th>


                    {/* SPECIFICATIONS */}
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap">
                      Specifications
                    </th>

                    {/* STATUS */}
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap">
                      Status
                    </th>

                    {/* ACTIONS */}
                    <th className="px-6 py-4 border-b border-[#EAE3D5] text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE3D5]">
                  {filteredLaptops.length === 0 ? (
                    <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">No matching assets found</td></tr>
                  ) : currentLaptops.map(laptop => (
                    <tr key={laptop.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap w-px"><p className="font-black text-slate-700">{laptop.brand} {laptop.model}</p></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-xs font-bold text-slate-500 truncate max-w-[200px]" title={laptop.specs}>
                          {laptop.specs || "N/A"}
                        </p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={laptop.status} /></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {assigningToRequest && currentUser.role === UserRole.ROOT && laptop.status === LaptopStatus.AVAILABLE ? (
                          <button onClick={() => deployAsset(assigningToRequest, laptop.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors">Assign Unit</button>
                        ) : (
                          <div className="flex justify-end gap-4">
                            <button onClick={() => setEditingLaptop({ ...laptop })} className="text-slate-300 hover:text-slate-900 transition-colors" title="Revision/Edit"><Icons.Clipboard className="w-5 h-5" /></button>
                            {currentUser.role === UserRole.ROOT && <button onClick={() => scrapAsset(laptop.id)} className="text-slate-300 hover:text-rose-500 transition-colors" title="Scrap/Retire"><Icons.Trash className="w-5 h-5" /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* --- PAGINATION CONTROLS --- */}
              {filteredLaptops.length > itemsPerPage && (
                <div className="px-12 py-8 border-t border-[#EAE3D5] bg-slate-50 flex items-center justify-between">

                  {/* Page Info */}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Page {currentPage} of {totalPages} — Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredLaptops.length)} results
                  </p>

                  {/* Controls */}
                  <div className="flex gap-2">
                    {/* Previous Button */}
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-6 py-3 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Previous
                    </button>

                    {/* Smart Page Numbers */}
                    <div className="flex gap-1">
                      {getPaginationGroup().map((item, index) => {
                        // Render "..." as a non-clickable span
                        if (item === "...") {
                          return (
                            <span key={`dots-${index}`} className="w-10 h-10 flex items-center justify-center text-slate-400 font-black">
                              ...
                            </span>
                          );
                        }

                        // Render Clickable Number
                        return (
                          <button
                            key={item}
                            onClick={() => setCurrentPage(item as number)}
                            className={`w-10 h-10 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${currentPage === item
                                ? 'bg-[#2C2C2C] text-white shadow-lg scale-110'
                                : 'bg-white border border-[#EAE3D5] text-slate-500 hover:bg-slate-50 hover:border-slate-300'
                              }`}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-6 py-3 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {activeTab === 'revisions' && currentUser.role === UserRole.ROOT && (
        <div className="space-y-12 animate-fadeIn">
          <header>
            <h2 className="text-4xl font-black text-slate-900">Revision Queue</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-2">Audit & Verifications</p>
          </header>

          <div className="space-y-8">
            {editRequests.length === 0 ? (
              <div className="p-24 text-center border-2 border-dashed border-slate-200 rounded-[48px]">
                <p className="text-slate-300 font-black uppercase text-xs tracking-[0.4em]">No Pending Revisions</p>
              </div>
            ) : editRequests.map(rev => {
              // Merge keys to ensure we show a row even if one side is missing data
              const allKeys = Array.from(new Set([
                ...Object.keys(rev.new_values || {}),
                ...Object.keys(rev.old_values || {})
              ])).filter(k => !['id', 'created_at'].includes(k));

              return (
                <div key={rev.id} className="bg-white rounded-[40px] border border-[#EAE3D5] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">

                  {/* --- TOP ROW: MAIN INFO & CONTROLS --- */}
                  <div className="px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#FDFBF7]">

                    {/* Request Details (Cleaned up) */}
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 font-black text-xl shadow-sm border border-[#EAE3D5]">
                        {rev.proposed_by?.charAt(0)}
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 text-lg">{rev.proposed_by}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {new Date(rev.requested_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Status & Reviewer */}
                    <div className="flex items-center gap-12">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Status</p>
                        <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-full border ${rev.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            rev.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                              'bg-rose-100 text-rose-700 border-rose-200'
                          }`}>
                          {rev.status}
                        </span>
                      </div>

                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Actioned By</p>
                        <p className="font-bold text-slate-900 text-sm">
                          {rev.reviewed_by || <span className="text-slate-300 italic text-xs">--</span>}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {rev.status === 'PENDING' && (
                      <div className="flex gap-3">
                        <button
                          onClick={() => processRevision(rev.id, true)}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-200"
                        >
                          <Icons.Check className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Approve</span>
                        </button>
                        <button
                          onClick={() => processRevision(rev.id, false)}
                          className="flex items-center gap-2 px-6 py-3 bg-white text-rose-600 border border-rose-100 rounded-2xl hover:bg-rose-50 transition-all"
                        >
                          <Icons.X className="w-4 h-4" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Reject</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* --- BOTTOM ROW: COMPARISON TABLE (Old vs New) --- */}
                  <div className="border-t border-[#EAE3D5]">
                    <div className="grid grid-cols-2 text-[10px] uppercase tracking-widest font-black text-slate-400 bg-white border-b border-[#EAE3D5]">
                      <div className="px-10 py-4 border-r border-[#EAE3D5]">Previous Configuration</div>
                      <div className="px-10 py-4 bg-amber-50/30 text-amber-600">Proposed Change</div>
                    </div>

                    <div className="divide-y divide-slate-50">
                      {allKeys.map(key => {
                        // Safely access values, defaulting to '-' if missing
                        const oldVal = String(rev.old_values?.[key] || '-');
                        const newVal = String(rev.new_values?.[key] || '-');
                        const isChanged = oldVal !== newVal;

                        // Skip rows where nothing is happening
                        if (!isChanged && oldVal === '-' && newVal === '-') return null;

                        return (
                          <div key={key} className={`grid grid-cols-2 text-sm ${isChanged ? 'bg-amber-50/10' : ''}`}>
                            <div className="px-10 py-4 border-r border-[#EAE3D5] flex justify-between items-center text-slate-500">
                              <span className="font-bold uppercase text-[9px] text-slate-300 tracking-widest w-24">{key.replace('_', ' ')}</span>
                              <span className="truncate w-full text-right">{oldVal}</span>
                            </div>
                            <div className={`px-10 py-4 flex justify-between items-center ${isChanged ? 'text-amber-700 font-bold bg-amber-50/50' : 'text-slate-500'}`}>
                              <span className="font-bold uppercase text-[9px] text-slate-300 tracking-widest w-24 md:hidden">{key.replace('_', ' ')}</span>
                              <span className="truncate w-full text-right">{newVal}</span>
                            </div>
                          </div>
                        );
                      })}

                      {/* Show Rejection Reason if it exists */}
                      {rev.rejection_reason && (
                        <div className="px-10 py-4 bg-rose-50 text-rose-700 text-xs font-bold border-t border-rose-100 flex gap-4">
                          <span className="uppercase tracking-widest text-[9px]">Rejection Note:</span>
                          <span>"{rev.rejection_reason}"</span>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'users' && currentUser.role === UserRole.ROOT && (
        <div className="space-y-12 animate-fadeIn">
          <header>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Admin Clearance</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-[0.2em] mt-2">Manage Identities & Roles</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {allProfiles.map(profile => {
              const isSelf = profile.id === currentUser.id;

              return (
                <div key={profile.id} className="group relative bg-white p-10 rounded-[56px] border border-[#EAE3D5] text-center shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col items-center">

                  {/* Delete Action - Top Right */}
                  {!isSelf && (
                    <button
                      onClick={() => removeUser(profile.id)}
                      className="absolute top-8 right-8 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all opacity-0 group-hover:opacity-100"
                      title="Remove Identity"
                    >
                      <Icons.Trash className="w-5 h-5" />
                    </button>
                  )}

                  {/* Avatar & Basic Info */}
                  <div className="w-24 h-24 bg-[#F9F6F0] rounded-[32px] flex items-center justify-center mb-6 text-3xl font-black text-slate-900 shadow-inner">
                    {profile.name.charAt(0)}
                  </div>

                  <div className="mb-6">
                    <h4 className="text-xl font-black text-slate-900 flex items-center justify-center gap-2">
                      {profile.name}
                      {isSelf && <span className="bg-[#2C2C2C] text-white text-[8px] px-2 py-0.5 rounded-full tracking-widest uppercase">You</span>}
                    </h4>
                    <p className="text-xs font-bold text-slate-400 mt-1">{profile.email}</p>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mt-1">{profile.employeeId}</p>
                  </div>

                  {/* Role Badge */}
                  <div className="mb-8">
                    <span className={`text-[9px] font-black uppercase px-4 py-2 rounded-full border ${profile.role === UserRole.ROOT
                        ? 'bg-purple-50 text-purple-600 border-purple-100'
                        : 'bg-slate-50 text-slate-500 border-slate-200'
                      }`}>
                      {profile.role} Access
                    </span>
                  </div>

                  {/* Management Controls */}
                  {!isSelf ? (
                    <div className="w-full space-y-3 mt-auto">
                      {/* Approval Toggle */}
                      <button
                        onClick={() => toggleApproval(profile.id, profile.isApproved)}
                        className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${profile.isApproved
                            ? 'bg-white text-rose-500 border-rose-100 hover:bg-rose-50'
                            : 'bg-[#2C2C2C] text-white border-transparent hover:bg-black hover:shadow-lg'
                          }`}
                      >
                        {profile.isApproved ? 'Suspend Access' : 'Approve Clearance'}
                      </button>

                      {/* Role Promotion/Demotion */}
                      {profile.role === UserRole.ROOT ? (
                        <button
                          onClick={() => demoteToAdmin(profile.id)}
                          className="w-full py-3 bg-slate-50 text-slate-500 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors"
                        >
                          Demote to Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => promoteToRoot(profile.id)}
                          className="w-full py-3 bg-white border border-[#EAE3D5] text-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors"
                        >
                          Promote to Root
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full mt-auto py-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest">
                      Active Session
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {activeTab === 'history' && (
        <div className="space-y-12 animate-fadeIn">
          <header>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Deployment History</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Immutable Audit History</p>
          </header>

          {/* --- CONTROL CENTER --- */}
          {/* --- CONTROL CENTER --- */}
          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col md:flex-row gap-4 items-center">
            
            <div className="relative flex-1 w-full">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                placeholder="Search Employee, Serial, or Model..."
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-3 w-full md:w-auto items-center">
              {/* BRAND FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={historyFilterBrand} onChange={e => setHistoryFilterBrand(e.target.value)}>
                <option value="ALL">All Brands</option>
                {Array.from(new Set(laptops.map(l => l.brand))).map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              {/* 👇 STATUS FILTER NEW 👇 */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={historyFilterStatus} onChange={e => setHistoryFilterStatus(e.target.value)}>
                <option value="ALL">All</option>
                <option value={RequestStatus.ASSIGNED}>Assigned</option>
                <option value={RequestStatus.RETURNED}>Returned</option>
              </select>

              {/* DATE RANGE FILTER */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">From</span>
                <input 
                  type="date" 
                  className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                  value={historyFromDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setHistoryFromDate(e.target.value)}
                />
                
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">To</span>
                <input 
                  type="date" 
                  className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer"
                  value={historyToDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setHistoryToDate(e.target.value)}
                />
                
                {(historyFromDate || historyToDate) && (
                  <button 
                    onClick={() => { setHistoryFromDate(""); setHistoryToDate(""); }}
                    className="ml-2 p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 rounded-full transition-colors"
                    title="Clear Dates"
                  >
                    <Icons.X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* --- DETAILS MODAL --- */}
          {viewingHistoryDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-2xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">
                <div className="bg-[#FDFBF7] px-8 py-6 border-b border-[#EAE3D5] flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-xl text-slate-900">Audit Record</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transaction ID: {viewingHistoryDetails.id}</p>
                  </div>
                  <button onClick={() => setViewingHistoryDetails(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Icons.X className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="p-8 space-y-6">
                  {/* The User */}
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Custodian</p>
                      <p className="font-black text-slate-900">{viewingHistoryDetails.employee_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Employee ID</p>
                      <p className="font-black text-slate-900">{viewingHistoryDetails.employee_id}</p>
                    </div>
                  </div>

                  
                  {viewingHistoryDetails.laptopDetails && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-[#EAE3D5] rounded-2xl p-5">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Asset Assigned</p>
                        
                        <p className="font-bold text-slate-900">{viewingHistoryDetails.laptopDetails.brand} {viewingHistoryDetails.laptopDetails.model}</p>
                       
                        <p className="text-xs text-slate-500 font-mono mt-1">SN: {viewingHistoryDetails.laptopDetails.serial_number}</p>
                      </div>
                      <div className="border border-[#EAE3D5] rounded-2xl p-5">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Request Type</p>
                        <p className="font-bold text-slate-900">{viewingHistoryDetails.type}</p>
                        <p className="text-xs text-slate-500 italic mt-1 truncate" title={viewingHistoryDetails.reason}>"{viewingHistoryDetails.reason}"</p>
                      </div>
                    </div>
                  )}

                  {/* The Timeline */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-[#EAE3D5] rounded-2xl p-5 bg-emerald-50/30">
                      <div className="flex items-center gap-2 mb-3 text-emerald-600"><Icons.Check className="w-4 h-4" /><span className="text-[9px] font-black uppercase tracking-widest">Deployment Auth</span></div>
                      <p className="font-bold text-slate-900 mb-1">{viewingHistoryDetails.approved_by || "System"}</p>
                      <p className="text-[10px] font-bold text-slate-500">{viewingHistoryDetails.assigned_at ? new Date(viewingHistoryDetails.assigned_at).toLocaleString() : 'N/A'}</p>
                    </div>

                    <div className={`border border-[#EAE3D5] rounded-2xl p-5 ${viewingHistoryDetails.status === RequestStatus.RETURNED ? 'bg-amber-50/30' : ''}`}>
                      <div className={`flex items-center gap-2 mb-3 ${viewingHistoryDetails.status === RequestStatus.RETURNED ? 'text-amber-600' : 'text-slate-400'}`}>
                        <Icons.History className="w-4 h-4" /><span className="text-[9px] font-black uppercase tracking-widest">Return Auth</span>
                      </div>
                      {viewingHistoryDetails.status === RequestStatus.RETURNED ? (
                        <>
                          <p className="font-bold text-slate-900 mb-1">{viewingHistoryDetails.return_approved_by || "System"}</p>
                          <p className="text-[10px] font-bold text-slate-500">{viewingHistoryDetails.actual_return_date ? new Date(viewingHistoryDetails.actual_return_date).toLocaleString() : 'N/A'}</p>
                        </>
                      ) : (
                        <p className="text-xs font-black text-slate-300 uppercase tracking-widest mt-2">Currently Deployed</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* --- HISTORY TABLE --- */}
          <div className="bg-white rounded-2xl border border-[#EAE3D5] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-[#F9F6F0] text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4 border-b border-[#EAE3D5]">Custodian</th>
                  <th className="px-6 py-4 border-b border-[#EAE3D5]">Asset Assigned</th>
                  <th className="px-6 py-4 border-b border-[#EAE3D5]">Status</th>
                  <th className="px-6 py-4 border-b border-[#EAE3D5] text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EAE3D5]">
                {historyLog.length === 0 ? (
                  <tr><td colSpan={4} className="p-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">No deployment records found</td></tr>
                ) : historyLog.map(record => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-black text-xs text-slate-900">{record.employee_name}</p>
                      <p className="text-[9px] text-slate-400 font-mono mt-0.5">{record.employee_id}</p>
                    </td>
                    <td className="px-6 py-4">
                      {record.laptopDetails ? (
                        <>
                          <p className="font-bold text-[11px] text-slate-800">{record.laptopDetails.brand} {record.laptopDetails.model}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">SN: {record.laptopDetails.serial_number}</p>
                        </>
                      ) : (
                        <span className="text-[9px] text-rose-400 font-bold uppercase">Asset Data Lost</span>
                      )}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={record.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setViewingHistoryDetails(record)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all inline-flex items-center justify-center"
                        title="View Audit Record"
                      >
                        <Icons.Clipboard className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'scrap' && (
        <div className="space-y-12 animate-fadeIn">
          <h2 className="text-4xl font-black text-slate-900">Scrap Registry</h2>
          <div className="bg-white rounded-[48px] border border-[#EAE3D5] overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-rose-50/50 text-[10px] font-black text-rose-400 uppercase tracking-widest"><tr><th className="px-12 py-10">Asset</th><th className="px-12 py-10">Ledger ID</th><th className="px-12 py-10">Disposition</th></tr></thead>
              <tbody className="divide-y divide-[#EAE3D5]">
                {laptops.filter(l => l.status === LaptopStatus.SCRAP).map(laptop => (
                  <tr key={laptop.id}>
                    <td className="px-12 py-12"><p className="font-black text-slate-900">{laptop.brand} {laptop.model}</p></td>
                    <td className="px-12 py-12 text-xs font-black text-slate-500">{laptop.service_id}</td>
                    <td className="px-12 py-12"><span className="px-4 py-1.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black uppercase">Asset Retired</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;
