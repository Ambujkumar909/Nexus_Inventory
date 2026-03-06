import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
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
  RequestType,
  AssetCategory
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
  const itemsPerPage = 50; 
  
  // Master Data
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [requests, setRequests] = useState<LaptopRequest[]>([]);
  const [allProfiles, setAllProfiles] = useState<User[]>([]);
  const [editRequests, setEditRequests] = useState<LaptopEditRequest[]>([]);
  const [importReport, setImportReport] = useState<{
    total: number;
    successCount: number;
    rejected: { row: number; serial: string; data: string; reason: string }[]; 
    successful: { row: number; brand: string; model: string; serial: string; tag: string }[]; 
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
  
  const [searchError, setSearchError] = useState(false);
  const [signupStatus, setSignupStatus] = useState<{ type: 'idle' | 'loading' | 'error' | 'success', message?: string }>({ type: 'idle' });

  const [userRequestForm, setUserRequestForm] = useState({ employeeId: '', name: '',email: '', type: RequestType.PERMANENT, reason: '', returnDate: '' });
  const [trackingId, setTrackingId] = useState('');
  const [trackedRequest, setTrackedRequest] = useState<LaptopRequest | null>(null);
  const [isAddingLaptop, setIsAddingLaptop] = useState(false);
  const [newLaptop, setNewLaptop] = useState({ brand: '', model: '', category: AssetCategory.LAPTOP, serialNumber: '', serviceId: '', specs: '', purchaseDate: '' });
  const [assigningToRequest, setAssigningToRequest] = useState<string | null>(null);
  const [editingLaptop, setEditingLaptop] = useState<Laptop | null>(null);
  const [viewingAssetDetails, setViewingAssetDetails] = useState<Laptop | null>(null);
  
  // --- HISTORY TAB STATE ---
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterCategory, setHistoryFilterCategory] = useState("ALL");
  const [historyFilterBrand, setHistoryFilterBrand] = useState("ALL");
  const [historyFilterStatus, setHistoryFilterStatus] = useState("ALL");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [viewingHistoryDetails, setViewingHistoryDetails] = useState<LaptopRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<LaptopRequest | null>(null);
  const [viewingScrapDetails, setViewingScrapDetails] = useState<Laptop | null>(null);
  
  // --- DEPLOYMENT QUEUE STATE ---
  const [queueSearch, setQueueSearch] = useState("");
  const [queueFilterCategory, setQueueFilterCategory] = useState("ALL");
  const [queueFilterStatus, setQueueFilterStatus] = useState("ALL");
  const [queueFilterType, setQueueFilterType] = useState("ALL");
  
  // --- SCRAP TAB STATE ---
  const [scrapSearch, setScrapSearch] = useState("");
  const [scrapFilterCategory, setScrapFilterCategory] = useState("ALL");
  const [scrapFilterBrand, setScrapFilterBrand] = useState("ALL");
  const [scrapFromDate, setScrapFromDate] = useState(""); 
  const [scrapToDate, setScrapToDate] = useState("");
  
  // --- SEARCH & FILTER ENGINE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("ALL");
  const [filterBrand, setFilterBrand] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [filterRam, setFilterRam] = useState("ALL");
  const [filterStorage, setFilterStorage] = useState("ALL");
  const [filterCpu, setFilterCpu] = useState("ALL");
  const [filterScreenSize, setFilterScreenSize] = useState("ALL");

  const normalize = (str: string) => str ? str.toLowerCase().replace(/\s+/g, '') : "";

  // --- ROBUST FILTERING ENGINE ---
  const filteredLaptops = useMemo(() => {
    return laptops.filter(laptop => {
      // Hide Scrapped items
      if (laptop.status === LaptopStatus.SCRAP) return false;

      // Prepare Data
      const brand = (laptop.brand || "").toLowerCase();
      const model = (laptop.model || "").toLowerCase();
      const serial = (laptop.serial_number || "").toLowerCase();
      const tag = (laptop.service_id || "").toLowerCase();

      // Split specs into an array of clean items
      const specItems = (laptop.specs || "")
        .toLowerCase()
        .split(',')
        .map(item => item.trim().replace(/\s+/g, ''));

      // Search Logic
      const s = searchQuery.toLowerCase().trim();
      const matchesSearch =
        s === "" ||
        brand.includes(s) ||
        model.includes(s) ||
        serial.includes(s) ||
        tag.includes(s);

      // Dropdown Logic
      const matchesCategory = filterCategory === "ALL" || laptop.category === filterCategory;
      const matchesBrand = filterBrand === "ALL" || brand === filterBrand.toLowerCase();
      const matchesStatus = filterStatus === "ALL" || laptop.status === filterStatus;

      // Specs Logic (EXACT MATCHING)
      const matchesRam = filterRam === "ALL" || specItems.some(item => item === filterRam.toLowerCase().replace(/\s+/g, ''));
      const matchesStorage = filterStorage === "ALL" || specItems.some(item => item === filterStorage.toLowerCase().replace(/\s+/g, ''));
      const matchesCpu = filterCpu === "ALL" || specItems.some(item => item.includes(filterCpu.toLowerCase().replace(/\s+/g, '')));
      const matchesScreenSize = filterScreenSize === "ALL" || specItems.some(item => item.includes(filterScreenSize.toLowerCase().replace(/\s+/g, '')));

      return matchesSearch && matchesCategory && matchesBrand && matchesStatus && matchesRam && matchesStorage && matchesCpu && matchesScreenSize;
    });
  }, [laptops, searchQuery, filterCategory, filterBrand, filterStatus, filterRam, filterStorage, filterCpu, filterScreenSize]);

  // --- HISTORY ENGINE ---
  const historyLog = useMemo(() => {
    const activeAndPastDeployments = requests.filter(
      r => r.status === RequestStatus.ASSIGNED || r.status === RequestStatus.RETURNED
    );

    const enrichedHistory = activeAndPastDeployments.map(req => {
      const laptop = laptops.find(l => l.id === req.assigned_laptop_id);
      return { ...req, laptopDetails: laptop };
    });

    return enrichedHistory.filter(record => {
      const s = historySearch.toLowerCase().trim();
      const empName = (record.employee_name || "").toLowerCase();
      const empId = (record.employee_id || "").toLowerCase();
      const brand = (record.laptopDetails?.brand || "").toLowerCase();
      const model = (record.laptopDetails?.model || "").toLowerCase();
      const serial = (record.laptopDetails?.serial_number || "").toLowerCase();
      const tag = (record.laptopDetails?.service_id || "").toLowerCase();
      const cat = record.laptopDetails?.category || "";

      const matchesSearch = s === "" ||
        empName.includes(s) || empId.includes(s) ||
        brand.includes(s) || model.includes(s) ||
        serial.includes(s) || tag.includes(s);

      const matchesCategory = historyFilterCategory === "ALL" || cat === historyFilterCategory;
      const matchesBrand = historyFilterBrand === "ALL" || brand === historyFilterBrand.toLowerCase();
      const matchesStatus = historyFilterStatus === "ALL" || record.status === historyFilterStatus;

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

      return matchesSearch && matchesCategory && matchesBrand && matchesStatus && matchesDate;
    });
  }, [requests, laptops, historySearch, historyFilterCategory, historyFilterBrand, historyFilterStatus, historyFromDate, historyToDate]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentLaptops = filteredLaptops.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredLaptops.length / itemsPerPage);

  const getPaginationGroup = () => {
    const pageNumbers = [];
    const siblingCount = 1; 
    const totalNumbers = siblingCount + 5; 

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(i);
      }
    } else {
      const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
      const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

      const showLeftDots = leftSiblingIndex > 2;
      const showRightDots = rightSiblingIndex < totalPages - 2;

      if (!showLeftDots && showRightDots) {
        let leftItemCount = 3 + 2 * siblingCount;
        let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
        return [...leftRange, "...", totalPages];
      }

      if (showLeftDots && !showRightDots) {
        let rightItemCount = 3 + 2 * siblingCount;
        let rightRange = Array.from({ length: rightItemCount }, (_, i) => totalPages - rightItemCount + i + 1);
        return [1, "...", ...rightRange];
      }

      if (showLeftDots && showRightDots) {
        let middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
        return [1, "...", ...middleRange, "...", totalPages];
      }
    }
    return pageNumbers;
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterBrand, filterStatus, filterRam, filterStorage, filterCpu, filterScreenSize]);

  const closeAddLaptopModal = () => {
    setIsAddingLaptop(false);
    setNewLaptop({ brand: '', model: '', category: AssetCategory.LAPTOP, serialNumber: '', serviceId: '', specs: '', purchaseDate: '' });
  };
  
  const [brandChartCategory, setBrandChartCategory] = useState<string>("ALL");
  const [agingCategory, setAgingCategory] = useState<string>("ALL");
  const [agingBrand, setAgingBrand] = useState<string>("ALL");
  const [agingTimeframe, setAgingTimeframe] = useState<"YEAR" | "MONTH">("YEAR");

  const analytics = useMemo(() => {
    // 1. TOP-LEVEL METRIC CARDS (Expanded to 6)
    const totalAssets = laptops.filter(l => l.status !== LaptopStatus.SCRAP).length;
    const availableAssets = laptops.filter(l => l.status === LaptopStatus.AVAILABLE).length;
    const assignedAssets = laptops.filter(l => l.status === LaptopStatus.ASSIGNED).length;
    const scrappedAssets = laptops.filter(l => l.status === LaptopStatus.SCRAP).length;
    const pendingReqs = requests.filter(r => r.status === RequestStatus.PENDING).length;
    const pendingRevs = editRequests.filter(e => e.status === 'PENDING').length;

    // 2. FLEET DISTRIBUTION (Donut Chart)
    const categoryCounts: Record<string, number> = {};
    laptops.filter(l => l.status !== LaptopStatus.SCRAP).forEach(l => {
      categoryCounts[l.category] = (categoryCounts[l.category] || 0) + 1;
    });
    const fleetData = Object.entries(categoryCounts).map(([name, value]) => ({ name, value }));

    // 3. BRAND ECOSYSTEM WITH FILTER (Bar Chart)
    const brandCounts: Record<string, number> = {};
    laptops.filter(l => l.status !== LaptopStatus.SCRAP)
           .filter(l => brandChartCategory === "ALL" || l.category === brandChartCategory)
           .forEach(l => {
             brandCounts[l.brand] = (brandCounts[l.brand] || 0) + 1;
           });
    const brandData = Object.entries(brandCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7); // Show top 7 brands to keep UI clean

    // 4. OPERATIONAL MATRIX (Stacked Bar)
    const opMatrixRaw: Record<string, { name: string, Available: number, Assigned: number, Scrapped: number }> = {};
    laptops.forEach(l => {
      if (!opMatrixRaw[l.category]) {
        opMatrixRaw[l.category] = { name: l.category, Available: 0, Assigned: 0, Scrapped: 0 };
      }
      if (l.status === LaptopStatus.AVAILABLE) opMatrixRaw[l.category].Available++;
      if (l.status === LaptopStatus.ASSIGNED) opMatrixRaw[l.category].Assigned++;
      if (l.status === LaptopStatus.SCRAP) opMatrixRaw[l.category].Scrapped++;
    });
    const opMatrixData = Object.values(opMatrixRaw);

    // 5. HARDWARE AGING / REFRESH CYCLE (Area Chart)
    const timeCounts: Record<string, number> = {};
    
    laptops
      .filter(l => agingCategory === "ALL" || l.category === agingCategory)
      .filter(l => agingBrand === "ALL" || l.brand === agingBrand)
      .forEach(l => {
        if (l.purchase_date) {
          // If YEAR, grab "YYYY". If MONTH, grab "YYYY-MM"
          const key = agingTimeframe === "YEAR" 
            ? l.purchase_date.substring(0, 4) 
            : l.purchase_date.substring(0, 7);
            
          timeCounts[key] = (timeCounts[key] || 0) + 1;
        }
      });

    const agingData = Object.entries(timeCounts)
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => a.time.localeCompare(b.time)); // Sorts chronologically
    // 6. EXPIRING LOANS (48-Hour Warning)
    const expiringLoans = requests
      .filter(r => r.status === RequestStatus.ASSIGNED && r.type === RequestType.TEMPORARY && r.return_date)
      .map(r => {
        const returnTime = new Date(r.return_date as string).getTime();
        const now = new Date().getTime();
        const hoursLeft = (returnTime - now) / (1000 * 60 * 60);
        return { ...r, hoursLeft };
      })
      .filter(r => r.hoursLeft <= 48) // Includes overdue (negative hours)
      .sort((a, b) => a.hoursLeft - b.hoursLeft);
    return { 
      cards: { totalAssets, availableAssets, assignedAssets, scrappedAssets, pendingReqs, pendingRevs },
      fleetData, 
      brandData, 
      opMatrixData,
      agingData, 
      expiringLoans
    };
  }, [laptops, requests, editRequests, brandChartCategory, agingCategory, agingBrand, agingTimeframe]);

  const CHART_COLORS = ['#2C2C2C', '#64748B', '#10B981', '#F59E0B', '#6366F1', '#8B5CF6', '#14B8A6'];

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
        supabase.from('laptops').select('*').range(0, 9999).order('created_at', { ascending: false }),
        supabase.from('laptop_requests').select('*').range(0, 9999).order('requested_at', { ascending: false }),
        supabase.from('profiles').select('*').range(0, 9999).order('created_at', { ascending: false }),
        supabase.from('laptop_edit_requests').select('*').range(0, 9999).order('requested_at', { ascending: false })
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
      setSignupStatus({ type: 'idle' }); 
    }, seconds);
  };

  const handleLedgerSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const found = requests.find(r =>
      r.id.toLowerCase() === trackingId.toLowerCase() ||
      r.employee_id.toLowerCase() === trackingId.toLowerCase()
    );
    if (found) {
      setTrackedRequest(found);
      setSearchError(false); 
    } else {
      setTrackedRequest(null);
      setSearchError(true); 
    }
  };

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
        setSignupForm({ email: '', password: '', confirmPassword: '', name: '', employeeId: '', mobileNumber: '' });

        if (isFirstUser) {
          setSignupStatus({ type: 'success', message: "Identity Registered. Accessing Root Gateway..." });
          setTimeout(() => checkUser(true), 1500);
          clearStatusLater(2000);
        } else {
          setSignupStatus({ type: 'success', message: "Application Transmitted. Awaiting Root Admin Clearance." });
          clearStatusLater(8000);
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
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginForm.email, password: loginForm.password });
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

  const parseCSVLine = (text: string) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') { current += '"'; i++; } else { inQuotes = !inQuotes; }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim()); current = '';
      } else { current += char; }
    }
    result.push(current.trim());
    return result;
  };
  
 // --- STRICT CSV PROCESSING ENGINE ---
  // --- STRICT CSV PROCESSING ENGINE ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // 1. CAPTURE THE INPUT ELEMENT IMMEDIATELY
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    
    if (!file) {
      inputElement.value = ''; // Reset if cancelled
      return;
    }

    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          inputElement.value = '';
          return;
        }

        // 2. STRIP INVISIBLE EXCEL CHARACTERS (Removes BOM & normalizes line breaks)
        const cleanText = text.replace(/^\uFEFF/, '').replace(/\r/g, '');
        const lines = cleanText.split('\n').filter(line => line.trim() !== '');

        if (lines.length < 2) {
            alert("CSV is empty or missing data rows.");
            inputElement.value = ''; // Reset on failure
            return;
        }

        // --- STRICT HEADER VALIDATION (Case-Insensitive) ---
        const expectedHeaders = ["brand", "model", "category", "specification", "serial number", "service id", "date of purchase"];
        const actualHeaders = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        
        const isHeaderValid = expectedHeaders.length === actualHeaders.length && 
                              expectedHeaders.every((val, index) => val === actualHeaders[index]);

        if (!isHeaderValid) {
            alert(`CRITICAL HALT: CSV Template Invalid.\n\nExpected Headers:\n${expectedHeaders.join(', ')}\n\nFound Headers:\n${actualHeaders.join(', ')}\n\nPlease correct the CSV headers and try again.`);
            inputElement.value = ''; // Reset on failure so they can try again!
            return;
        }

        // Process rows
        const rows = lines.slice(1);
        const validLaptops: any[] = [];
        const rejected: { row: number; serial: string; data: string; reason: string }[] = [];
        const successful: { row: number; brand: string; model: string; serial: string; tag: string }[] = [];
        let totalProcessed = 0;

        const existingSerials = new Set(laptops.map(l => l.serial_number ? l.serial_number.toLowerCase() : ""));

        rows.forEach((row, index) => {
          if (!row.trim()) return;
          totalProcessed++;
          const cols = parseCSVLine(row);
          const rowNumber = index + 2;

          if (cols.length < 7) {
            rejected.push({ row: rowNumber, serial: 'N/A', data: row.substring(0, 30) + '...', reason: 'Missing required columns' });
            return;
          }

          const brand = cols[0]?.trim();
          const model = cols[1]?.trim();
          const categoryRaw = cols[2]?.trim(); 
          const specs = cols[3]?.trim();        
          const serial = cols[4]?.trim();       
          const serviceId = cols[5]?.trim();    
          const rawDate = cols[6]?.trim();

          // Error 1: PRECISE Missing Critical Data Check
          const missingFields: string[] = [];
          if (!brand) missingFields.push("Brand");
          if (!categoryRaw) missingFields.push("Category");
          if (!serial) missingFields.push("Serial Number");
          if (!serviceId) missingFields.push("Tag ID");

          if (missingFields.length > 0) {
            rejected.push({ 
              row: rowNumber, 
              serial: serial || 'N/A', 
              data: `${brand || 'Unknown'} ${model || ''}`.trim() + ` | Tag: ${serviceId || 'Unknown'}`, 
              reason: `Missing required field(s): ${missingFields.join(', ')}` 
            });
            return;
          }
          // Error 2: Invalid Category Check
          const matchedCategory = Object.values(AssetCategory).find(c => c.toLowerCase() === categoryRaw.toLowerCase());
          if (!matchedCategory) {
              rejected.push({ row: rowNumber, serial: serial, data: `${brand} ${model} [${categoryRaw}]`, reason: `Unrecognized Category: '${categoryRaw}'` });
              return;
          }

          // Error 3: Duplicate Checker
          if (existingSerials.has(serial.toLowerCase())) {
            rejected.push({ row: rowNumber, serial: serial, data: `[${matchedCategory}] ${brand} ${model || ''}`, reason: 'Duplicate Serial Number' });
            return;
          }

          let formattedDate = null;
          if (rawDate && rawDate.includes('-')) {
            const parts = rawDate.split('-');
            if (parts.length === 3) formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }

          validLaptops.push({ 
              brand, model, category: matchedCategory, specs, 
              serial_number: serial, service_id: serviceId, purchase_date: formattedDate, status: LaptopStatus.AVAILABLE,registered_by: currentUser?.name || 'System Admin' 
          });
          
          successful.push({ row: rowNumber, brand: `[${matchedCategory}] ${brand}`, model, serial, tag: serviceId });
          existingSerials.add(serial.toLowerCase());
        });

        // Database Upload Chunking
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
        
        setImportReport({ total: totalProcessed, successCount: validLaptops.length, rejected, successful });
        
      } catch (err) {
        alert("An unexpected error occurred while parsing the CSV. Check the console for details.");
        console.error(err);
      } finally {
        // 3. ALWAYS RESET THE INPUT: Even if it succeeds, fails, or crashes.
        inputElement.value = ''; 
      }
    };
    
    reader.readAsText(file);
  };
  // --- SCRAP ENGINE ---
  const filteredScrapLaptops = useMemo(() => {
    return laptops.filter(laptop => {
      if (laptop.status !== LaptopStatus.SCRAP) return false;
      const brand = (laptop.brand || "").toLowerCase();
      const model = (laptop.model || "").toLowerCase();
      const serial = (laptop.serial_number || "").toLowerCase();
      const tag = (laptop.service_id || "").toLowerCase();

      const s = scrapSearch.toLowerCase().trim();
      const matchesSearch = s === "" || brand.includes(s) || model.includes(s) || serial.includes(s) || tag.includes(s);
      
      const matchesCategory = scrapFilterCategory === "ALL" || laptop.category === scrapFilterCategory;
      const matchesBrand = scrapFilterBrand === "ALL" || brand === scrapFilterBrand.toLowerCase();
      let matchesDate = true;
      if (scrapFromDate || scrapToDate) {
        const from = scrapFromDate ? new Date(scrapFromDate).getTime() : null;
        let to = null;
        
        if (scrapToDate) {
          const d = new Date(scrapToDate);
          d.setHours(23, 59, 59, 999);
          to = d.getTime();
        }

        const scrappedTime = laptop.scrapped_at ? new Date(laptop.scrapped_at).getTime() : null;

        // If it was scrapped before we started tracking timestamps (legacy data), hide it if a date filter is active
        if (scrappedTime !== null) {
          matchesDate = (!from || scrappedTime >= from) && (!to || scrappedTime <= to);
        } else {
          matchesDate = false; 
        }
      }

      return matchesSearch && matchesCategory && matchesBrand && matchesDate;
    });
  }, [laptops, scrapSearch, scrapFilterCategory, scrapFilterBrand, scrapFromDate, scrapToDate]);

  // --- DEPLOYMENT QUEUE ENGINE ---
  const filteredQueue = useMemo(() => {
    const activeRequests = requests.filter(r => r.status !== RequestStatus.RETURNED);
    const enrichedQueue = activeRequests.map(req => {
      const laptop = laptops.find(l => l.id === req.assigned_laptop_id);
      return { ...req, laptopDetails: laptop };
    });

    return enrichedQueue.filter(record => {
      const s = queueSearch.toLowerCase().trim();
      const empName = (record.employee_name || "").toLowerCase();
      const empId = (record.employee_id || "").toLowerCase();
      const reqId = (record.id || "").toLowerCase();
      const brand = (record.laptopDetails?.brand || "").toLowerCase();
      const model = (record.laptopDetails?.model || "").toLowerCase();
      const serial = (record.laptopDetails?.serial_number || "").toLowerCase();
      const tag = (record.laptopDetails?.service_id || "").toLowerCase();
      const cat = record.laptopDetails?.category || "";

      const matchesSearch = s === "" || empName.includes(s) || empId.includes(s) || reqId.includes(s) ||
        brand.includes(s) || model.includes(s) || serial.includes(s) || tag.includes(s);

      const matchesCategory = queueFilterCategory === "ALL" || cat === queueFilterCategory;
      const matchesStatus = queueFilterStatus === "ALL" || record.status === queueFilterStatus;
      const matchesType = queueFilterType === "ALL" || record.type === queueFilterType;

      return matchesSearch && matchesCategory && matchesStatus && matchesType;
    });
  }, [requests, laptops, queueSearch, queueFilterCategory, queueFilterStatus, queueFilterType]);

  // --- ENTERPRISE PDF GENERATOR ---
  const downloadImportReportPDF = () => {
    if (!importReport) return;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const reportId = `REP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const dateStr = new Date().toLocaleString();
    const adminName = currentUser?.name || 'System Admin';

    doc.setFontSize(20); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text("NEXUS IT | ENTERPRISE ERP", 14, 20);
    doc.setFontSize(12); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139); doc.text("ASSET REGISTRY: BULK IMPORT AUDIT REPORT", 14, 27);
    doc.setFontSize(9); doc.setTextColor(0, 0, 0); doc.text(`Report ID: ${reportId}`, 14, 40); doc.text(`Date Generated: ${dateStr}`, 14, 45); doc.text(`Authorized Admin: ${adminName}`, 14, 50);
    doc.setFont("helvetica", "bold"); doc.text("EXECUTIVE SUMMARY", 14, 60); doc.setFont("helvetica", "normal"); doc.text(`Total Rows Processed: ${importReport.total}`, 14, 66);
    doc.setTextColor(16, 185, 129); doc.text(`Successfully Imported: ${importReport.successCount} (Written to live inventory)`, 14, 71);
    doc.setTextColor(244, 63, 94); doc.text(`Rejected Rows: ${importReport.rejected.length} (Requires manual correction)`, 14, 76);

    let finalY = 85;
    if (importReport.rejected.length > 0) {
      autoTable(doc, {
        startY: finalY, head: [["CSV Row", "Rejection Reason", "Asset Data Snippet"]], body: importReport.rejected.map(r => [r.row.toString(), r.reason, r.data]),
        theme: 'grid', styles: { fontSize: 8, cellPadding: 2, textColor: [40, 40, 40] }, headStyles: { fillColor: [244, 63, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
        margin: { top: 20, bottom: 20 }, didDrawPage: (data) => { if (data.pageNumber > 1) { doc.setFontSize(8); doc.setTextColor(150); doc.text(`Nexus IT Audit Report | ID: ${reportId} | Page ${doc.internal.getNumberOfPages()}`, 14, 10); } }
      });
      // @ts-ignore
      finalY = doc.lastAutoTable.finalY + 15;
    }

    if (importReport.successful.length > 0) {
      doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42);
      if (finalY > 260) { doc.addPage(); finalY = 20; }
      doc.text("PART 2: SUCCESS LEDGER (IMPORTED ASSETS)", 14, finalY); finalY += 5;
      autoTable(doc, {
        startY: finalY, head: [["CSV Row", "Unit Identity", "Serial Number", "Service Tag"]], body: importReport.successful.map(s => [s.row.toString(), `${s.brand} ${s.model}`, s.serial, s.tag]),
        theme: 'striped', styles: { fontSize: 8, cellPadding: 1.5, textColor: [40, 40, 40] }, headStyles: { fillColor: [44, 44, 44], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 20, bottom: 20 }, didDrawPage: (data) => { doc.setFontSize(8); doc.setTextColor(150); doc.text(`Nexus IT Audit Report | ID: ${reportId} | Page ${doc.internal.getNumberOfPages()}`, 14, 10); }
      });
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150); doc.text(`End of Report | Strict Confidentiality Applied.`, 14, 285); }
    doc.save(`Nexus_Import_Audit_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    await supabase.from('laptop_requests').insert({
      id, employee_id: userRequestForm.employeeId, employee_name: userRequestForm.name, employee_email: userRequestForm.email, type: userRequestForm.type, reason: userRequestForm.reason, status: RequestStatus.PENDING, return_date: userRequestForm.returnDate || null
    });
    alert(`Request Transmitted: ${id}`);
    setUserRequestForm({ employeeId: '', name: '',email: '', type: RequestType.PERMANENT, reason: '', returnDate: '' });
    fetchData();
  };

  const handleAddLaptop = async (e: React.FormEvent) => {
    e.preventDefault();
    await supabase.from('laptops').insert({
      brand: newLaptop.brand,
      model: newLaptop.model,
      category: newLaptop.category, 
      serial_number: newLaptop.serialNumber,
      service_id: newLaptop.serviceId,
      specs: newLaptop.specs,
      purchase_date: newLaptop.purchaseDate,
      status: LaptopStatus.AVAILABLE,
      registered_by: currentUser?.name || 'System Admin'
    });
    closeAddLaptopModal();
    fetchData();
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLaptop) return;

    const newValues = {
      brand: editingLaptop.brand,
      model: editingLaptop.model,
      category: editingLaptop.category, 
      serial_number: editingLaptop.serial_number,
      service_id: editingLaptop.service_id,
      specs: editingLaptop.specs
    };

    const originalLaptop = laptops.find(l => l.id === editingLaptop.id);
    const oldValues = originalLaptop ? {
      brand: originalLaptop.brand,
      model: originalLaptop.model,
      category: originalLaptop.category, 
      serial_number: originalLaptop.serial_number,
      service_id: originalLaptop.service_id,
      specs: originalLaptop.specs
    } : null;

    const { error } = await supabase.from('laptop_edit_requests').insert({
      laptop_id: editingLaptop.id, proposed_by: currentUser?.name, new_values: newValues, old_values: oldValues, status: 'PENDING'
    });

    if (error) alert("Error submitting revision: " + error.message);
    else alert("Revision Proposal Submitted to Queue.");
    
    setEditingLaptop(null);
    fetchData();
  };

  const approveRequest = async (id: string) => { await supabase.from('laptop_requests').update({ status: RequestStatus.APPROVED, approved_by: currentUser?.name }).eq('id', id); fetchData(); };
  const rejectRequest = async (id: string) => { await supabase.from('laptop_requests').update({ status: RequestStatus.REJECTED }).eq('id', id); fetchData(); };

  const deployAsset = async (reqId: string, laptopId: string) => {
    const req = requests.find(r => r.id === reqId);
    const laptop = laptops.find(l => l.id === laptopId);
    if (!req || !laptop) return;

    if (confirm(`Confirm assignment of asset:\n\nUnit: [${laptop.category}] ${laptop.brand} ${laptop.model}\nTag: ${laptop.service_id}\n\nTo User: ${req.employee_name}?`)) {
      try {
        const userEmployeeId = (req as any).employee_id || (req as any).employeeId;
        if (!userEmployeeId) return alert("Error: Employee ID is missing on this request.");

        const { error: reqError } = await supabase.from('laptop_requests').update({ status: RequestStatus.ASSIGNED, assigned_laptop_id: laptopId, assigned_at: new Date().toISOString() }).eq('id', reqId);
        if (reqError) throw reqError;

        const { error: laptopError } = await supabase.from('laptops').update({ status: LaptopStatus.ASSIGNED, last_assigned_to: userEmployeeId }).eq('id', laptopId);
        if (laptopError) throw laptopError;

        setAssigningToRequest(null);
        alert(`Asset successfully deployed to ${req.employee_name}.`);
        fetchData();
      } catch (error: any) { alert("Deployment Failed: " + error.message); }
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
      } catch (err) { alert("Error returning asset. Please try again."); }
    }
  };

  const scrapAsset = async (laptopId: string) => {
    const laptop = laptops.find(l => l.id === laptopId);
    const msg = laptop?.status === LaptopStatus.ASSIGNED ? "Warning: This asset is currently ASSIGNED. Decommissioning it will retire the hardware immediately. Continue?" : "Decommission this asset?";
    if (confirm(msg)) {
      const { error } = await supabase.from('laptops').update({ status: LaptopStatus.SCRAP, scrapped_by: currentUser?.name || 'System Admin', scrapped_at: new Date().toISOString() }).eq('id', laptopId);
      if (error) alert("Error decommissioning asset: " + error.message);
      else { alert("Asset successfully decommissioned."); fetchData(); }
    }
  };

  const activateIdentity = async (profileId: string) => { await supabase.from('profiles').update({ is_approved: true }).eq('id', profileId); fetchData(); };

  const processRevision = async (revId: string, approve: boolean) => {
    const rev = editRequests.find(r => r.id === revId);
    if (!rev) return;
    const reviewerName = currentUser?.name || 'Unknown Admin';

    if (approve) {
      await supabase.from('laptops').update(rev.new_values).eq('id', rev.laptop_id);
      await supabase.from('laptop_edit_requests').update({ status: 'APPROVED', reviewed_by: reviewerName, reviewed_at: new Date().toISOString() }).eq('id', revId);
    } else {
      const reason = prompt("Please enter a reason for rejection:");
      if (reason === null) return; 
      await supabase.from('laptop_edit_requests').update({ status: 'REJECTED', reviewed_by: reviewerName, reviewed_at: new Date().toISOString(), rejection_reason: reason }).eq('id', revId);
    }
    fetchData();
  };

  const getAssignedLaptopDetails = (laptopId?: string) => { if (!laptopId) return null; return laptops.find(l => l.id === laptopId); };

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
                <h2 className="text-4xl font-black mb-12 text-slate-900">Asset Application</h2>
                <form onSubmit={handleUserSubmit} className="space-y-10">
                  
                  {/* Row 1: ID and Name (Side by Side) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className={labelClass}>Corporate ID</label>
                      <input required placeholder="EMP-XXXX" className={inputClass} value={userRequestForm.employeeId} onChange={e => setUserRequestForm({ ...userRequestForm, employeeId: e.target.value })} />
                    </div>
                    <div>
                      <label className={labelClass}>Authorized Name</label>
                      <input required placeholder="James Sterling" className={inputClass} value={userRequestForm.name} onChange={e => setUserRequestForm({ ...userRequestForm, name: e.target.value })} />
                    </div>
                  </div>

                  {/* Row 2: Email (Full Width) */}
                  <div>
                    <label className={labelClass}>Corporate Email</label>
                    <input required type="email" placeholder="james@nexus.com" className={inputClass} value={userRequestForm.email} onChange={e => setUserRequestForm({ ...userRequestForm, email: e.target.value })} />
                  </div>

                  {/* Row 3: Request Type Buttons */}
                  <div className="grid grid-cols-3 gap-4">
                    {[RequestType.PERMANENT, RequestType.TEMPORARY, RequestType.REPLACEMENT].map(t => (
                      <button key={t} type="button" onClick={() => setUserRequestForm({ ...userRequestForm, type: t })} className={`py-4 rounded-3xl text-[10px] font-black tracking-widest border transition-all ${userRequestForm.type === t ? 'bg-[#2C2C2C] text-white border-transparent' : 'bg-[#F9F6F0] text-slate-400 border-[#EAE3D5]'}`}>{t}</button>
                    ))}
                  </div>

                  {/* Optional: Return Date for Temporary */}
                  {userRequestForm.type === RequestType.TEMPORARY && (
                    <div>
                      <label className={labelClass}>Return Date</label>
                      <input type="date" required className={inputClass} value={userRequestForm.returnDate} min={new Date().toISOString().split('T')[0]} onChange={e => setUserRequestForm({ ...userRequestForm, returnDate: e.target.value })} />
                    </div>
                  )}

                  {/* Row 4: Justification */}
                  <div>
                    <label className={labelClass}>Justification</label>
                    <textarea required rows={4} placeholder="Business rationale..." className={inputClass} value={userRequestForm.reason} onChange={e => setUserRequestForm({ ...userRequestForm, reason: e.target.value })} />
                  </div>

                  <button className="w-full py-6 bg-[#2C2C2C] text-white font-black rounded-[32px] shadow-2xl hover:bg-black transition-all uppercase text-sm tracking-widest">
                    Transmit Request
                  </button>
                </form>
              </div>
              <div className="lg:col-span-5 bg-[#2C2C2C] rounded-[48px] p-12 text-white shadow-2xl">
                <h3 className="text-2xl font-black mb-8 tracking-tight">Ledger Tracking</h3>
                <form onSubmit={(e) => { e.preventDefault(); const found = requests.find(r => r.id === trackingId || r.employee_id === trackingId); setTrackedRequest(found || null); }} className="relative mb-8">
                  <input placeholder="Employee Id" className="w-full px-8 py-5 rounded-[24px] bg-white/10 border border-white/20 text-white placeholder:text-white/30 text-sm outline-none" value={trackingId} onChange={e => {
                    setTrackingId(e.target.value);
                    setSearchError(false); 
                    if (e.target.value === '') setTrackedRequest(null);
                  }} />
                  {trackingId && (
                    <button type="button" onClick={() => { setTrackingId(''); setTrackedRequest(null); }} className="absolute right-14 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all duration-200" title="Clear Search"><Icons.X className="w-4 h-4" /></button>
                  )}
                  <button onClick={handleLedgerSearch} className="absolute right-3 top-3 p-3 bg-white text-black rounded-2xl hover:scale-105 transition-all"><Icons.History className="w-5 h-5" /></button>
                </form>
                {trackedRequest ? (
                  <div className="bg-white/5 p-8 rounded-[32px] border border-white/10 animate-fadeIn">
                    <div className="flex justify-between items-start mb-4">
                      <h4 className="font-black text-xl">{trackedRequest.id}</h4>
                      <StatusBadge status={trackedRequest.status} />
                    </div>
                    <p className="text-xs font-bold text-white/40">Custodian: {trackedRequest.employee_name}</p>
                  </div>
                ) : searchError ? (
                  <div className="py-12 text-center border-2 border-dashed border-rose-500/30 bg-rose-500/10 rounded-[32px] animate-pulse">
                    <Icons.Alert className="w-8 h-8 text-rose-400 mx-auto mb-3" />
                    <p className="text-rose-300 font-black uppercase text-[10px] tracking-widest">Identity Not Found</p>
                    <p className="text-rose-400/60 text-[9px] font-bold mt-1">Check Employee ID or Serial</p>
                  </div>
                ) : (
                  <div className="py-12 text-center text-white/20 font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-white/10 rounded-[32px]">No Active Query</div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] px-4">
        <div className="relative w-full max-w-[440px] bg-white p-8 sm:p-10 rounded-[32px] border border-[#EAE3D5] shadow-2xl">
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
                  <input type="tel" required maxLength={10} placeholder=" " className={inputClass} value={signupForm.mobileNumber} onChange={(e) => { const onlyNums = e.target.value.replace(/\D/g, ''); if (onlyNums.length <= 10) { setSignupForm({ ...signupForm, mobileNumber: onlyNums }); } }} />
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

  // --- Strict render logic for category-specific filters ---
  const showComputeFilters = ['ALL', AssetCategory.LAPTOP, AssetCategory.PC, AssetCategory.IMAC].includes(filterCategory as any);
  const showMobileFilters = ['ALL', AssetCategory.MOBILE_PHONE].includes(filterCategory as any);
  const showMonitorFilters = ['ALL', AssetCategory.MONITOR].includes(filterCategory as any);

  const getAssetAgeInfo = (purchaseDate?: string | null) => {
    if (!purchaseDate) return { borderClass: 'border-transparent', bgClass: '' };
    
    // Calculate difference in days
    const daysOld = Math.floor((new Date().getTime() - new Date(purchaseDate).getTime()) / (1000 * 3600 * 24));
    
    if (daysOld < 90) return { borderClass: 'border-rose-400', bgClass: 'bg-rose-50/40' };
    if (daysOld < 365) return { borderClass: 'border-amber-400', bgClass: 'bg-amber-50/40' };
    if (daysOld < 730) return { borderClass: 'border-emerald-400', bgClass: 'bg-emerald-50/40' };
    if (daysOld < 1095) return { borderClass: 'border-blue-400', bgClass: 'bg-blue-50/40' }; // < 3 Years
    if (daysOld < 1460) return { borderClass: 'border-purple-400', bgClass: 'bg-purple-50/40' }; // < 4 Years
    return { borderClass: 'border-slate-400', bgClass: 'bg-slate-100/50' }; // 4+ Years
  };
  return (
    <Layout user={currentUser} onLogout={handleSignOut} activeTab={activeTab} setActiveTab={setActiveTab}>

      {activeTab === 'dashboard' && (
        <div className="space-y-12 animate-fadeIn">
          <header>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Executive Overview</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live Enterprise Telemetry</p>
          </header>

          {/* --- ROW 1: 6 METRIC CARDS --- */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            <MetricCard title="Total Fleet" value={analytics.cards.totalAssets} icon={Icons.Laptop} />
            <MetricCard title="Active Pool" value={analytics.cards.availableAssets} icon={Icons.Check} trendUp trend="Ready" />
            <MetricCard title="Deployed" value={analytics.cards.assignedAssets} icon={Icons.Users} />
            <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white rounded-xl shadow-sm text-rose-500"><Icons.Trash className="w-5 h-5" /></div>
              </div>
              <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Scrapped</h3>
              <p className="text-3xl font-black text-rose-900">{analytics.cards.scrappedAssets}</p>
            </div>
            <MetricCard title="Open Reqs" value={analytics.cards.pendingReqs} icon={Icons.Clipboard} />
            <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white rounded-xl shadow-sm text-amber-500"><Icons.History className="w-5 h-5" /></div>
              </div>
              <h3 className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Revisions</h3>
              <p className="text-3xl font-black text-amber-900">{analytics.cards.pendingRevs}</p>
            </div>
          </div>
          {/* --- EXPIRING LOANS ALERT (48 HOURS) --- */}
          {analytics.expiringLoans.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 rounded-[32px] p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-6 text-rose-700">
                <Icons.Alert className="w-6 h-6 animate-pulse" />
                <h3 className="text-lg font-black uppercase tracking-widest">Action Required: Expiring Loans</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {analytics.expiringLoans.map(loan => {
                  const isOverdue = loan.hoursLeft < 0;
                  const laptop = getAssignedLaptopDetails(loan.assigned_laptop_id);
                  
                  return (
                    <div key={loan.id} className="bg-white p-5 rounded-2xl border border-rose-100 shadow-sm flex flex-col">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-black text-slate-900">{loan.employee_name}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-widest">{loan.employee_id}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${isOverdue ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-100 text-amber-700'}`}>
                          {isOverdue ? 'OVERDUE' : '< 48 HOURS'}
                        </span>
                      </div>
                      
                      <div className="mb-4 flex-1">
                        <p className="text-xs font-bold text-slate-600">{laptop?.brand} {laptop?.model}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Tag: {laptop?.service_id || 'Unknown'}</p>
                      </div>

                      {/* Return Button directly on the dashboard! */}
                      <button 
                        onClick={() => returnAsset(loan.id)} 
                        className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Process Return
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* --- ROW 2: CHARTS --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* 1. Fleet Distribution (Donut) */}
            <div className="bg-white p-8 rounded-[40px] border border-[#EAE3D5] shadow-sm lg:col-span-1 h-[400px] flex flex-col">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Fleet Distribution</h3>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie 
                      data={analytics.fleetData} 
                      innerRadius={80} 
                      outerRadius={110} 
                      paddingAngle={5} 
                      dataKey="value"
                      minAngle={15} /* 👇 THIS IS THE MAGIC FIX 👇 */
                    >
                      {analytics.fleetData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 2. Brand Ecosystem (Bar Chart with Dropdown) */}
            <div className="bg-white p-8 rounded-[40px] border border-[#EAE3D5] shadow-sm lg:col-span-2 h-[400px] flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Brand Ecosystem</h3>
                <select 
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 uppercase tracking-widest focus:outline-none cursor-pointer"
                  value={brandChartCategory} 
                  onChange={e => setBrandChartCategory(e.target.value)}
                >
                  <option value="ALL">All Categories</option>
                  {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.brandData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                    <Bar dataKey="count" fill="#2C2C2C" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* --- ROW 3: DEEP DIVE CHARTS --- */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* 3. Operational Matrix (Stacked Bar) */}
            <div className="bg-white p-8 rounded-[40px] border border-[#EAE3D5] shadow-sm h-[400px] flex flex-col">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-6">Operational Matrix</h3>
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.opMatrixData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold' }} />
                    <Bar dataKey="Assigned" stackId="a" fill="#2C2C2C" />
                    <Bar dataKey="Available" stackId="a" fill="#10B981" />
                    <Bar dataKey="Scrapped" stackId="a" fill="#F43F5E" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 4. Hardware Aging (Area Chart) */}
            <div className="bg-white p-8 rounded-[40px] border border-[#EAE3D5] shadow-sm h-[400px] flex flex-col">
              
              {/* Filter Header */}
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest shrink-0">Acquisition Lifecycle</h3>
                
                <div className="flex flex-wrap gap-2">
                  {/* Timeframe Toggle */}
                  <select className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black text-slate-600 uppercase tracking-widest focus:outline-none cursor-pointer" 
                    value={agingTimeframe} onChange={e => setAgingTimeframe(e.target.value as "YEAR" | "MONTH")}>
                    <option value="YEAR">Yearly</option>
                    <option value="MONTH">Monthly</option>
                  </select>

                  {/* Category Filter */}
                  <select className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black text-slate-600 uppercase tracking-widest focus:outline-none cursor-pointer" 
                    value={agingCategory} onChange={e => { setAgingCategory(e.target.value); setAgingBrand("ALL"); }}>
                    <option value="ALL">All Categories</option>
                    {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>

                  {/* Brand Filter (Dynamic based on Category) */}
                  <select className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[9px] font-black text-slate-600 uppercase tracking-widest focus:outline-none cursor-pointer" 
                    value={agingBrand} onChange={e => setAgingBrand(e.target.value)}>
                    <option value="ALL">All Brands</option>
                    {Array.from(new Set(laptops.filter(l => agingCategory === "ALL" || l.category === agingCategory).map(l => l.brand))).map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              {/* The Chart */}
              <div className="flex-1 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.agingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                    
                    {/* Changed dataKey to 'time' */}
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94A3B8' }} />
                    <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                    <Area type="monotone" dataKey="count" stroke="#6366F1" strokeWidth={4} fillOpacity={1} fill="url(#colorCount)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-6 animate-fadeIn">
          <header className="mb-4">
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Deployment Queue</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Active Operations & Approvals</p>
          </header>

          {/* --- QUEUE CONTROL CENTER --- */}
          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                placeholder="Search Employee, ID, Request ID, or Asset..."
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                value={queueSearch}
                onChange={(e) => setQueueSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-3 overflow-x-auto pb-1 md:pb-0 w-full md:w-auto">
              {/* CATEGORY FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={queueFilterCategory} onChange={e => setQueueFilterCategory(e.target.value)}>
                <option value="ALL">All Categories</option>
                {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              {/* STATUS FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={queueFilterStatus} onChange={e => setQueueFilterStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value={RequestStatus.PENDING}>Pending</option>
                <option value={RequestStatus.APPROVED}>Approved</option>
                <option value={RequestStatus.ASSIGNED}>Assigned</option>
                <option value={RequestStatus.REJECTED}>Rejected</option>
              </select>

              {/* TYPE FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={queueFilterType} onChange={e => setQueueFilterType(e.target.value)}>
                <option value="ALL">All Types</option>
                <option value={RequestType.PERMANENT}>Permanent</option>
                <option value={RequestType.TEMPORARY}>Temporary</option>
                <option value={RequestType.REPLACEMENT}>Replacement</option>
              </select>
            </div>
          </div>

          {/* --- DETAILS MODAL (Pop-up) --- */}
          {viewingRequest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-2xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">
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
                <div className="p-8 space-y-6">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    <h4 className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Request Justification</h4>
                    <p className="text-sm font-medium text-slate-700 italic">"{viewingRequest.reason || 'No justification provided.'}"</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="border border-[#EAE3D5] rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3 text-emerald-600">
                        <Icons.Check className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Authorized By</span>
                      </div>
                      <p className="font-bold text-slate-900">{viewingRequest.approved_by || "Pending"}</p>
                      {viewingRequest.assigned_at ? (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assigned: {new Date(viewingRequest.assigned_at).toLocaleDateString()}</p>
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
                      {viewingRequest.actual_return_date ? (
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Returned: {new Date(viewingRequest.actual_return_date).toLocaleDateString()}</p>
                      ) : (
                        <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Still Active / N/A</p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-8 py-4 border-t border-[#EAE3D5] text-right">
                  <button onClick={() => setViewingRequest(null)} className="px-6 py-2 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50">Close Details</button>
                </div>
              </div>
            </div>
          )}

          {/* --- MAIN TABLE --- */}
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
                {filteredQueue.length === 0 ? (
                  <tr><td colSpan={5} className="p-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">Queue Clear or No Matches</td></tr>
                ) : filteredQueue.map(req => {
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
                        {req.laptopDetails ? (
                          <div className="leading-tight">
                            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-black uppercase mr-1">{req.laptopDetails.category}</span>
                            <span className="text-[10px] font-bold text-slate-800">{req.laptopDetails.brand} {req.laptopDetails.model}</span>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{req.laptopDetails.service_id}</p>
                          </div>
                        ) : req.status === RequestStatus.REJECTED ? (
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Request Denied</span>
                        ) : (
                          <span className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Pending Match</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={req.status} /></td>

                      {/* CONTROLS COLUMN */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button onClick={() => setViewingRequest(req)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="View Full Details">
                            <Icons.Clipboard className="w-4 h-4" />
                          </button>
                          <div className="w-px h-4 bg-slate-200 mx-1"></div>
                          {currentUser.role === UserRole.ROOT && req.status === RequestStatus.PENDING && (
                            <>
                              <button onClick={() => approveRequest(req.id)} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg" title="Approve Request"><Icons.Check className="w-4 h-4" /></button>
                              <button onClick={() => rejectRequest(req.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg" title="Reject Request"><Icons.X className="w-4 h-4" /></button>
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
                            <p className="text-xs font-black text-slate-800"><span className="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded mr-1 uppercase">{assignedLaptop.category}</span>{assignedLaptop.brand} {assignedLaptop.model}</p>
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
              <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                Showing {filteredLaptops.length} of {laptops.filter(l => l.status !== LaptopStatus.SCRAP).length} Active Assets
              </p>
            </div>
            {currentUser.role === UserRole.ROOT && (
              <div className="flex items-center gap-4">
                
                {/* 👇 FIX ADDED: onClick clears the memory BEFORE you select a file! */}
                <input 
                  type="file" 
                  accept=".csv" 
                  id="csvInput" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                  onClick={(e) => { (e.target as HTMLInputElement).value = ''; }} 
                />
                
                <button onClick={() => document.getElementById('csvInput')?.click()} className="px-6 py-4 bg-white border border-[#EAE3D5] text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all flex items-center gap-2">
                  <Icons.Clipboard className="w-4 h-4 text-slate-400" /> Import CSV
                </button>
                <button onClick={() => setIsAddingLaptop(true)} className="px-8 py-4 bg-[#2C2C2C] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all">Add Asset</button>
              </div>
            )}
            
          </header>

          {/* --- CONTROL CENTER --- */}
          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col xl:flex-row gap-4 items-start xl:items-center">
            
            {/* Search Input (Anti-Squish Fix: w-full xl:w-[320px] shrink-0) */}
            <div className="relative w-full xl:w-[320px] shrink-0">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                placeholder="Search Brand, Model, Serial, or Tag..."
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters (Fix: changed overflow-x-auto to flex-wrap w-full) */}
            <div className="flex flex-wrap gap-3 w-full">
              
              {/* CATEGORY FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                  value={filterCategory} onChange={e => {
                  setFilterCategory(e.target.value);
                  setFilterRam("ALL"); setFilterStorage("ALL"); setFilterCpu("ALL"); setFilterScreenSize("ALL");
                }}>
                <option value="ALL">All Categories</option>
                {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              {/* BRAND FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
                <option value="ALL">All Brands</option>
                {Array.from(
                  new Map(
                    laptops
                      .filter(l => filterCategory === "ALL" || l.category === filterCategory)
                      .filter(l => l.brand)
                      .map(l => [l.brand.trim().toLowerCase(), l.brand.trim().charAt(0).toUpperCase() + l.brand.trim().slice(1)])
                  ).values()
                ).map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              {/* STATUS FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100"
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value={LaptopStatus.AVAILABLE}>Available</option>
                <option value={LaptopStatus.ASSIGNED}>Assigned</option>
              </select>

              {/* 💻 SHARED FILTERS: RAM & DISK (Compute + Mobile) */}
              {(showComputeFilters || showMobileFilters) && (
                <>
                  <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={filterRam} onChange={e => setFilterRam(e.target.value)}>
                    <option value="ALL">RAM</option>
                    <option value="4GB">4 GB</option>
                    <option value="8GB">8 GB</option>
                    <option value="12GB">12 GB</option>
                    <option value="16GB">16 GB</option>
                    <option value="18GB">18 GB</option>
                    <option value="24GB">24 GB</option>
                    <option value="32GB">32 GB</option>
                    <option value="36GB">36 GB</option>
                    <option value="48GB">48 GB</option>
                    <option value="64GB">64 GB</option>
                    <option value="96GB">96 GB</option>
                    <option value="128GB">128 GB</option>
                  </select>
                  
                  <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={filterStorage} onChange={e => setFilterStorage(e.target.value)}>
                    <option value="ALL">Disk</option>
                    <option value="32GB">32 GB</option>
                    <option value="64GB">64 GB</option>
                    <option value="128GB">128 GB</option>
                    <option value="256GB">256 GB</option>
                    <option value="500GB">500 GB</option>
                    <option value="512GB">512 GB</option>
                    <option value="1TB">1 TB</option>
                    <option value="2TB">2 TB</option>
                    <option value="4TB">4 TB</option>
                    <option value="8TB">8 TB</option>
                  </select>
                </>
              )}

              {/* 💻 COMPUTE SPECIFIC: CPU */}
              {showComputeFilters && (
                  <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={filterCpu} onChange={e => setFilterCpu(e.target.value)}>
                    <option value="ALL">CPU</option>
                    <option value="i3">Intel Core i3</option>
                    <option value="i5">Intel Core i5</option>
                    <option value="i7">Intel Core i7</option>
                    <option value="i9">Intel Core i9</option>
                    <option value="Xeon">Intel Xeon</option>
                    <option value="M1">Apple M1</option>
                    <option value="M1 Pro">Apple M1 Pro</option>
                    <option value="M1 Max">Apple M1 Max</option>
                    <option value="M2">Apple M2</option>
                    <option value="M2 Pro">Apple M2 Pro</option>
                    <option value="M2 Max">Apple M2 Max</option>
                    <option value="M3">Apple M3</option>
                    <option value="M3 Pro">Apple M3 Pro</option>
                    <option value="M3 Max">Apple M3 Max</option>
                    <option value="M4">Apple M4</option>
                    <option value="Ryzen 3">AMD Ryzen 3</option>
                    <option value="Ryzen 5">AMD Ryzen 5</option>
                    <option value="Ryzen 7">AMD Ryzen 7</option>
                    <option value="Ryzen 9">AMD Ryzen 9</option>
                    <option value="Threadripper">AMD Threadripper</option>
                    <option value="Snapdragon">Snapdragon</option>
                  </select>
              )}

              {/* 🖥️ MONITOR SPECIFIC: SCREEN SIZE */}
              {showMonitorFilters && (
                <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={filterScreenSize} onChange={e => setFilterScreenSize(e.target.value)}>
                  <option value="ALL">Screen Size</option>
                  <option value="13">13-inch</option>
                  <option value="14">14-inch</option>
                  <option value="15">15-inch</option>
                  <option value="16">16-inch</option>
                  <option value="18">18-inch</option>
                  <option value="19">19-inch</option>
                  <option value="21">21-inch</option>
                  <option value="22">22-inch</option>
                  <option value="24">24-inch</option>
                  <option value="27">27-inch</option>
                  <option value="32">32-inch</option>
                  <option value="34">34-inch</option>
                  <option value="38">38-inch</option>
                  <option value="40">40-inch</option>
                  <option value="49">49-inch</option>
                </select>
              )}
            </div>
          </div>
          {/* --- ASSET DETAILS MODAL (NEW) --- */}
          {viewingAssetDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">
                <div className="bg-[#FDFBF7] px-8 py-6 border-b border-[#EAE3D5] flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </div>
                    <div>
                      <h3 className="font-black text-xl text-slate-900">Asset Profile</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Detailed Origin & Specs</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingAssetDetails(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><Icons.X className="w-5 h-5 text-slate-400" /></button>
                </div>
                
                <div className="p-8 space-y-6">
                  <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Unit Identity</p>
                    <p className="font-black text-lg text-slate-900"><span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded uppercase text-slate-600 mr-2">{viewingAssetDetails.category}</span>{viewingAssetDetails.brand} {viewingAssetDetails.model}</p>
                    <div className="flex gap-6 mt-3 pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Serial Number</p>
                        <p className="font-mono text-xs font-bold text-slate-700">{viewingAssetDetails.serial_number}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Service Tag</p>
                        <p className="font-mono text-xs font-bold text-slate-700">{viewingAssetDetails.service_id}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border border-indigo-100 rounded-2xl p-5 bg-white">
                    <div className="flex items-center gap-2 mb-4 text-indigo-500">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                      <span className="text-[10px] font-black uppercase tracking-widest">Acquisition Audit</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Registered By</p>
                        
                        <p className="font-bold text-slate-900">{(viewingAssetDetails as any).registered_by || "Legacy Record (Pre-Audit)"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Purchase Date</p>
                        <p className="text-xs font-bold text-slate-500">{viewingAssetDetails.purchase_date ? new Date(viewingAssetDetails.purchase_date).toLocaleDateString() : "Unknown"}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-slate-50 px-8 py-4 border-t border-[#EAE3D5] text-right">
                  <button onClick={() => setViewingAssetDetails(null)} className="px-6 py-2 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">Close</button>
                </div>
              </div>
            </div>
          )}

          {/* --- EDIT MODAL --- */}
          {editingLaptop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-8">
              <div className="bg-white w-full max-w-2xl p-12 rounded-[56px] border border-[#EAE3D5] shadow-2xl relative animate-fadeInDown">
                <button onClick={() => setEditingLaptop(null)} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900"><Icons.X className="w-8 h-8" /></button>
                <h3 className="text-3xl font-black mb-8 text-slate-900">Asset Revision</h3>
                <form onSubmit={handleEditSubmit} className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className={labelClass}>Asset Category</label>
                    <select required className={inputClass} value={editingLaptop.category} onChange={e => setEditingLaptop({ ...editingLaptop, category: e.target.value as AssetCategory })}>
                      {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
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

          {/* --- ADD MODAL --- */}
          {isAddingLaptop && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6" style={{ backgroundColor: '#eae3d508', backdropFilter: 'blur(1px)' }}>
              <div className="bg-white w-full max-w-2xl p-12 rounded-[48px] border border-[#EAE3D5] shadow-2xl relative animate-fadeInDown">
                <button onClick={closeAddLaptopModal} className="absolute top-10 right-10 text-slate-300 hover:text-slate-900 transition-colors">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <h3 className="text-2xl font-black mb-8 text-slate-900">Asset Registration</h3>

                <form onSubmit={handleAddLaptop} className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className={labelClass}>Asset Category</label>
                    <select required className={inputClass} value={newLaptop.category} onChange={e => setNewLaptop({ ...newLaptop, category: e.target.value as AssetCategory })}>
                      {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>

                  <input required placeholder="Brand" className={inputClass} value={newLaptop.brand} onChange={e => setNewLaptop({ ...newLaptop, brand: e.target.value })} />
                  <input required placeholder="Model" className={inputClass} value={newLaptop.model} onChange={e => setNewLaptop({ ...newLaptop, model: e.target.value })} />
                  <input required placeholder="Serial Number" className={inputClass} value={newLaptop.serialNumber} onChange={e => setNewLaptop({ ...newLaptop, serialNumber: e.target.value })} />
                  <input required placeholder="Service ID" className={inputClass} value={newLaptop.serviceId} onChange={e => setNewLaptop({ ...newLaptop, serviceId: e.target.value })} />
                  
                  <div className="col-span-2">
                    <label className={labelClass}>Specification (Comma Separated)</label>
                    <input required placeholder="e.g. 16GB, i7, 512GB OR 27-inch, 4K" className={inputClass} value={newLaptop.specs} onChange={e => setNewLaptop({ ...newLaptop, specs: e.target.value })} />
                  </div>

                  <div className="col-span-2">
                    <label className={labelClass}>Date of Purchase</label>
                    <input required type="date" className={inputClass} value={newLaptop.purchaseDate} max={new Date().toISOString().split('T')[0]} onChange={e => setNewLaptop({ ...newLaptop, purchaseDate: e.target.value })} />
                  </div>
                  
                  <div className="col-span-2 flex gap-4 mt-2">
                    <button type="button" onClick={closeAddLaptopModal} className="flex-1 font-bold text-slate-400">Cancel</button>
                    <button className="flex-1 py-4 bg-[#2C2C2C] text-white rounded-2xl font-black shadow-xl uppercase tracking-widest text-xs">Confirm Entry</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* --- MAIN TABLE --- */}
          <div className="bg-white rounded-[32px] border border-[#EAE3D5] overflow-hidden shadow-sm">
            
            {/* 👇 NEW: LIFECYCLE LEGEND HEADER 👇 */}
            <div className="bg-[#FDFBF7] border-b border-[#EAE3D5] px-8 py-3 flex flex-col md:flex-row gap-3 items-center justify-between">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                Hardware Lifecycle Indicator
              </span>
              <div className="flex flex-wrap justify-center gap-4 text-[8px] font-black uppercase tracking-widest text-slate-500 cursor-help">
                <div className="flex items-center gap-1.5" title="Newly Acquired (Under 3 Months)"><div className="w-2.5 h-2.5 rounded bg-rose-400"></div> &lt; 90 Days</div>
                <div className="flex items-center gap-1.5" title="First Year Hardware"><div className="w-2.5 h-2.5 rounded bg-amber-400"></div> &lt; 1 Year</div>
                <div className="flex items-center gap-1.5" title="Standard Mid-Life"><div className="w-2.5 h-2.5 rounded bg-emerald-400"></div> &lt; 2 Years</div>
                <div className="flex items-center gap-1.5" title="Late Mid-Life"><div className="w-2.5 h-2.5 rounded bg-blue-400"></div> &lt; 3 Years</div>
                <div className="flex items-center gap-1.5" title="Approaching End of Warranty"><div className="w-2.5 h-2.5 rounded bg-purple-400"></div> &lt; 4 Years</div>
                <div className="flex items-center gap-1.5" title="Legacy Hardware / Due for Refresh"><div className="w-2.5 h-2.5 rounded bg-slate-400"></div> 4+ Years</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#F9F6F0] text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-[#EAE3D5]">
                  <tr>
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap w-px">Asset Identity</th>
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap">Specifications</th>
                    <th className="px-6 py-4 border-b border-[#EAE3D5] whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 border-b border-[#EAE3D5] text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EAE3D5]">
                  {filteredLaptops.length === 0 ? (
                    <tr><td colSpan={5} className="p-20 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">No matching assets found</td></tr>
                  ) : currentLaptops.map(laptop => {
                    
                    // 👇 Calculate Age Colors here for this specific row
                    const ageInfo = getAssetAgeInfo(laptop.purchase_date);

                    return (
                    <tr key={laptop.id} className={`transition-colors hover:bg-slate-50/80 ${ageInfo.bgClass}`}>
                      
                      {/* 👇 Apply the Left Border Color to the first TD */}
                      <td className={`px-6 py-4 whitespace-nowrap w-px border-l-[6px] ${ageInfo.borderClass}`}>
                        <span className="bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded text-[8px] font-black uppercase mb-1 inline-block shadow-sm">{laptop.category}</span>
                        <p className="font-black text-slate-700">{laptop.brand} {laptop.model}</p>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-xs font-bold text-slate-500 truncate max-w-[200px]" title={laptop.specs}>{laptop.specs || "N/A"}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={laptop.status} /></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {assigningToRequest && currentUser.role === UserRole.ROOT && laptop.status === LaptopStatus.AVAILABLE ? (
                          <button onClick={() => deployAsset(assigningToRequest, laptop.id)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors shadow-sm">Assign Unit</button>
                        ) : (
                          <div className="flex justify-end gap-4">
                            {/* Eye/Info Icon */}
                            <button onClick={() => setViewingAssetDetails(laptop)} className="text-slate-300 hover:text-indigo-500 transition-colors" title="View Audit Details">
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            </button>

                            <button onClick={() => setEditingLaptop({ ...laptop })} className="text-slate-300 hover:text-slate-900 transition-colors" title="Revision/Edit"><Icons.Clipboard className="w-5 h-5" /></button>
                            {currentUser.role === UserRole.ROOT && <button onClick={() => scrapAsset(laptop.id)} className="text-slate-300 hover:text-rose-500 transition-colors" title="Scrap/Retire"><Icons.Trash className="w-5 h-5" /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
              
              {/* --- PAGINATION CONTROLS --- */}
              {filteredLaptops.length > itemsPerPage && (
                <div className="px-12 py-8 border-t border-[#EAE3D5] bg-slate-50 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Page {currentPage} of {totalPages} — Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredLaptops.length)} results
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-6 py-3 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Previous</button>
                    <div className="flex gap-1">
                      {getPaginationGroup().map((item, index) => {
                        if (item === "...") return <span key={`dots-${index}`} className="w-10 h-10 flex items-center justify-center text-slate-400 font-black">...</span>;
                        return (
                          <button key={item} onClick={() => setCurrentPage(item as number)} className={`w-10 h-10 flex items-center justify-center rounded-xl text-[10px] font-black transition-all ${currentPage === item ? 'bg-[#2C2C2C] text-white shadow-lg scale-110' : 'bg-white border border-[#EAE3D5] text-slate-500 hover:bg-slate-50 hover:border-slate-300'}`}>{item}</button>
                        );
                      })}
                    </div>
                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-6 py-3 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all">Next</button>
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
              const allKeys = Array.from(new Set([ ...Object.keys(rev.new_values || {}), ...Object.keys(rev.old_values || {}) ])).filter(k => !['id', 'created_at'].includes(k));
              return (
                <div key={rev.id} className="bg-white rounded-[40px] border border-[#EAE3D5] overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                  <div className="px-10 py-8 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#FDFBF7]">
                    <div className="flex items-center gap-6">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-slate-900 font-black text-xl shadow-sm border border-[#EAE3D5]">{rev.proposed_by?.charAt(0)}</div>
                      <div>
                        <h4 className="font-black text-slate-900 text-lg">{rev.proposed_by}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{new Date(rev.requested_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-12">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Status</p>
                        <span className={`text-[10px] font-black uppercase px-3 py-1.5 rounded-full border ${rev.status === 'PENDING' ? 'bg-amber-100 text-amber-700 border-amber-200' : rev.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-rose-100 text-rose-700 border-rose-200'}`}>{rev.status}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Actioned By</p>
                        <p className="font-bold text-slate-900 text-sm">{rev.reviewed_by || <span className="text-slate-300 italic text-xs">--</span>}</p>
                      </div>
                    </div>
                    {rev.status === 'PENDING' && (
                      <div className="flex gap-3">
                        <button onClick={() => processRevision(rev.id, true)} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-200"><Icons.Check className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Approve</span></button>
                        <button onClick={() => processRevision(rev.id, false)} className="flex items-center gap-2 px-6 py-3 bg-white text-rose-600 border border-rose-100 rounded-2xl hover:bg-rose-50 transition-all"><Icons.X className="w-4 h-4" /><span className="text-[10px] font-black uppercase tracking-widest">Reject</span></button>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[#EAE3D5]">
                    <div className="grid grid-cols-2 text-[10px] uppercase tracking-widest font-black text-slate-400 bg-white border-b border-[#EAE3D5]">
                      <div className="px-10 py-4 border-r border-[#EAE3D5]">Previous Configuration</div>
                      <div className="px-10 py-4 bg-amber-50/30 text-amber-600">Proposed Change</div>
                    </div>
                    <div className="divide-y divide-slate-50">
                      {allKeys.map(key => {
                        const oldVal = String(rev.old_values?.[key] || '-');
                        const newVal = String(rev.new_values?.[key] || '-');
                        const isChanged = oldVal !== newVal;
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
                  {!isSelf && (
                    <button onClick={() => removeUser(profile.id)} className="absolute top-8 right-8 p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all opacity-0 group-hover:opacity-100" title="Remove Identity"><Icons.Trash className="w-5 h-5" /></button>
                  )}
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
                  <div className="mb-8">
                    <span className={`text-[9px] font-black uppercase px-4 py-2 rounded-full border ${profile.role === UserRole.ROOT ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>{profile.role} Access</span>
                  </div>
                  {!isSelf ? (
                    <div className="w-full space-y-3 mt-auto">
                      <button onClick={() => toggleApproval(profile.id, profile.isApproved)} className={`w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${profile.isApproved ? 'bg-white text-rose-500 border-rose-100 hover:bg-rose-50' : 'bg-[#2C2C2C] text-white border-transparent hover:bg-black hover:shadow-lg'}`}>
                        {profile.isApproved ? 'Suspend Access' : 'Approve Clearance'}
                      </button>
                      {profile.role === UserRole.ROOT ? (
                        <button onClick={() => demoteToAdmin(profile.id)} className="w-full py-3 bg-slate-50 text-slate-500 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">Demote to Admin</button>
                      ) : (
                        <button onClick={() => promoteToRoot(profile.id)} className="w-full py-3 bg-white border border-[#EAE3D5] text-slate-900 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-50 transition-colors">Promote to Root</button>
                      )}
                    </div>
                  ) : (
                    <div className="w-full mt-auto py-4 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest">Active Session</div>
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

          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col xl:flex-row gap-4 items-start xl:items-center">
            
            {/* Search Input (Anti-Squish Fix Applied Here) */}
            <div className="relative w-full xl:w-[320px] shrink-0">
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

            {/* Filters Wrapper (Flex-wrap ensures they stack neatly if out of space) */}
            <div className="flex flex-wrap gap-3 w-full items-center">
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={historyFilterCategory} onChange={e => setHistoryFilterCategory(e.target.value)}>
                <option value="ALL">All Categories</option>
                {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={historyFilterBrand} onChange={e => setHistoryFilterBrand(e.target.value)}>
                <option value="ALL">All Brands</option>
                {Array.from(
                  new Map(
                    laptops
                      .filter(l => l.brand)
                      .map(l => [l.brand.trim().toLowerCase(), l.brand.trim().charAt(0).toUpperCase() + l.brand.trim().slice(1)])
                  ).values()
                ).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={historyFilterStatus} onChange={e => setHistoryFilterStatus(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value={RequestStatus.ASSIGNED}>Assigned</option>
                <option value={RequestStatus.RETURNED}>Returned</option>
              </select>
              
              {/* DATE RANGE FILTER */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">From</span>
                <input type="date" className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer" value={historyFromDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setHistoryFromDate(e.target.value)} />
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">To</span>
                <input type="date" className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer" value={historyToDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setHistoryToDate(e.target.value)} />
                {(historyFromDate || historyToDate) && (
                  <button onClick={() => { setHistoryFromDate(""); setHistoryToDate(""); }} className="ml-2 p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 rounded-full transition-colors" title="Clear Dates"><Icons.X className="w-3 h-3" /></button>
                )}
              </div>
            </div>
          </div>

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
                        <p className="font-bold text-slate-900"><span className="text-[8px] bg-slate-100 px-1 py-0.5 rounded text-slate-500 mr-1 uppercase">{viewingHistoryDetails.laptopDetails.category}</span>{viewingHistoryDetails.laptopDetails.brand} {viewingHistoryDetails.laptopDetails.model}</p>
                        <p className="text-xs text-slate-500 font-mono mt-1">SN: {viewingHistoryDetails.laptopDetails.serial_number}</p>
                      </div>
                      <div className="border border-[#EAE3D5] rounded-2xl p-5">
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Request Type</p>
                        <p className="font-bold text-slate-900">{viewingHistoryDetails.type}</p>
                        <p className="text-xs text-slate-500 italic mt-1 truncate" title={viewingHistoryDetails.reason}>"{viewingHistoryDetails.reason}"</p>
                      </div>
                    </div>
                  )}
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
                          <p className="font-bold text-[11px] text-slate-800"><span className="text-[8px] bg-slate-100 px-1.5 py-0.5 rounded mr-1 uppercase text-slate-500">{record.laptopDetails.category}</span>{record.laptopDetails.brand} {record.laptopDetails.model}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">SN: {record.laptopDetails.serial_number}</p>
                        </>
                      ) : (
                        <span className="text-[9px] text-rose-400 font-bold uppercase">Asset Data Lost</span>
                      )}
                    </td>
                    <td className="px-6 py-4"><StatusBadge status={record.status} /></td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => setViewingHistoryDetails(record)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all inline-flex items-center justify-center" title="View Audit Record">
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
          <header>
            <h2 className="text-4xl font-black text-slate-900 tracking-tight">Scrap Registry</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Decommissioned Assets</p>
          </header>

          <div className="bg-white p-6 rounded-[32px] border border-[#EAE3D5] shadow-sm flex flex-col xl:flex-row gap-4 items-start xl:items-center">
            
            {/* Search Input (Anti-Squish Fix Applied) */}
            <div className="relative w-full xl:w-[320px] shrink-0">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
              <input
                type="text"
                placeholder="Search Model, Serial, or Tag ID..."
                className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400"
                value={scrapSearch}
                onChange={(e) => setScrapSearch(e.target.value)}
              />
            </div>

            {/* Filters Wrapper */}
            <div className="flex flex-wrap gap-3 w-full items-center">
              
              {/* CATEGORY FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={scrapFilterCategory} onChange={e => setScrapFilterCategory(e.target.value)}>
                <option value="ALL">All Categories</option>
                {Object.values(AssetCategory).map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
              
              {/* BRAND FILTER */}
              <select className="px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-600 focus:outline-none cursor-pointer hover:bg-slate-100" value={scrapFilterBrand} onChange={e => setScrapFilterBrand(e.target.value)}>
                <option value="ALL">All Brands</option>
                {Array.from(
                  new Map(
                    laptops
                      .filter(l => l.status === LaptopStatus.SCRAP && l.brand)
                      .map(l => [l.brand.trim().toLowerCase(), l.brand.trim().charAt(0).toUpperCase() + l.brand.trim().slice(1)])
                  ).values()
                ).map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              {/* DATE RANGE FILTER */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">From</span>
                <input type="date" className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer" value={scrapFromDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setScrapFromDate(e.target.value)} />
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">To</span>
                <input type="date" className="bg-transparent text-xs font-bold text-slate-600 focus:outline-none cursor-pointer" value={scrapToDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => setScrapToDate(e.target.value)} />
                {(scrapFromDate || scrapToDate) && (
                  <button onClick={() => { setScrapFromDate(""); setScrapToDate(""); }} className="ml-2 p-1.5 bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 rounded-full transition-colors" title="Clear Dates"><Icons.X className="w-3 h-3" /></button>
                )}
              </div>
            </div>
          </div>

          {viewingScrapDetails && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
              <div className="bg-white w-full max-w-xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">
                <div className="bg-rose-50/50 px-8 py-6 border-b border-rose-100 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rose-100 text-rose-600 rounded-xl"><Icons.Trash className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-black text-xl text-rose-900">Decommission Record</h3>
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mt-1">Asset Permanently Retired</p>
                    </div>
                  </div>
                  <button onClick={() => setViewingScrapDetails(null)} className="p-2 hover:bg-rose-100 rounded-full transition-colors"><Icons.X className="w-5 h-5 text-rose-400" /></button>
                </div>
                <div className="p-8 space-y-6">
                  <div className="border border-slate-200 rounded-2xl p-5 bg-slate-50">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Unit Identity</p>
                    <p className="font-black text-lg text-slate-900"><span className="text-[10px] bg-slate-200 px-2 py-0.5 rounded uppercase text-slate-600 mr-2">{viewingScrapDetails.category}</span>{viewingScrapDetails.brand} {viewingScrapDetails.model}</p>
                    <div className="flex gap-6 mt-3 pt-3 border-t border-slate-200">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Serial Number</p>
                        <p className="font-mono text-xs font-bold text-slate-700">{viewingScrapDetails.serial_number}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Service Tag</p>
                        <p className="font-mono text-xs font-bold text-slate-700">{viewingScrapDetails.service_id}</p>
                      </div>
                    </div>
                  </div>
                  <div className="border border-rose-100 rounded-2xl p-5 bg-white">
                    <div className="flex items-center gap-2 mb-4 text-rose-500">
                      <Icons.History className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Execution Audit</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Authorized By</p>
                        <p className="font-bold text-slate-900">{viewingScrapDetails.scrapped_by || "Legacy Record (Pre-Audit)"}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Timestamp</p>
                        <p className="text-xs font-bold text-slate-500">{viewingScrapDetails.scrapped_at ? new Date(viewingScrapDetails.scrapped_at).toLocaleString() : "Unknown"}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-8 py-4 border-t border-[#EAE3D5] text-right">
                  <button onClick={() => setViewingScrapDetails(null)} className="px-6 py-2 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">Close</button>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-[32px] border border-[#EAE3D5] overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead className="bg-rose-50/50 text-[10px] font-black text-rose-400 uppercase tracking-widest">
                <tr>
                  <th className="px-8 py-6 border-b border-rose-100">Asset Identity</th>
                  <th className="px-8 py-6 border-b border-rose-100">Serial Number & Service Id</th>
                  <th className="px-8 py-6 border-b border-rose-100">Disposition</th>
                  <th className="px-8 py-6 border-b border-rose-100 text-right">Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredScrapLaptops.length === 0 ? (
                   <tr><td colSpan={4} className="p-12 text-center text-slate-300 font-bold uppercase text-[10px] tracking-[0.4em]">No matching assets found</td></tr>
                ) : filteredScrapLaptops.map(laptop => (
                  <tr key={laptop.id} className="hover:bg-rose-50/30 transition-colors">
                    <td className="px-8 py-5">
                      <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px] font-black uppercase mb-1 inline-block">{laptop.category}</span>
                      <p className="font-black text-slate-900">{laptop.brand} {laptop.model}</p>
                    </td>
                    <td className="px-8 py-5">
                      <p className="text-xs font-bold text-slate-700 font-mono mb-0.5">SN: {laptop.serial_number}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">TAG: {laptop.service_id}</p>
                    </td>
                    <td className="px-8 py-5">
                      <span className="px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-rose-200">Scrapped</span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button onClick={() => setViewingScrapDetails(laptop)} className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-all inline-flex items-center justify-center" title="View Audit Record">
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
          {importReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] border border-[#EAE3D5] shadow-2xl overflow-hidden animate-fadeInDown">
            <div className="bg-[#FDFBF7] px-8 py-6 border-b border-[#EAE3D5] flex justify-between items-center">
              <div>
                <h3 className="font-black text-xl text-slate-900">Bulk Import Report</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Asset Registry — Import Audit</p>
              </div>
              <button onClick={() => setImportReport(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <Icons.X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Total Processed</p>
                  <p className="text-3xl font-black text-slate-900">{importReport.total}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center">
                  <p className="text-[9px] font-black uppercase text-emerald-500 tracking-widest mb-2">Imported</p>
                  <p className="text-3xl font-black text-emerald-600">{importReport.successCount}</p>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 text-center">
                  <p className="text-[9px] font-black uppercase text-rose-400 tracking-widest mb-2">Rejected</p>
                  <p className="text-3xl font-black text-rose-500">{importReport.rejected.length}</p>
                </div>
              </div>
              {importReport.rejected.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-black uppercase text-rose-500 tracking-widest mb-3">Rejected Rows</h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {importReport.rejected.map((r, i) => (
                      <div key={i} className="flex items-start gap-3 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
                        <span className="text-[9px] font-black text-rose-400 uppercase tracking-widest whitespace-nowrap mt-0.5">Row {r.row}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-rose-700 truncate">{r.reason}</p>
                          <p className="text-[9px] text-rose-400 font-mono truncate">{r.data}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="bg-slate-50 px-8 py-5 border-t border-[#EAE3D5] flex justify-between items-center">
              <button onClick={() => setImportReport(null)} className="px-6 py-2 bg-white border border-[#EAE3D5] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-colors">
                Close
              </button>
              <button onClick={downloadImportReportPDF} className="px-8 py-3 bg-[#2C2C2C] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg">
                <Icons.Clipboard className="w-4 h-4" /> Download PDF Report
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default App;