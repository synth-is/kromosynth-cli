import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA
import hdbscan
import hnswlib
import os
from enum import Enum

class EliteSelectionStrategy(Enum):
    PARETO_DOMINANCE = 1
    WEIGHTED_SUM = 2
    PERFORMANCE_ONLY = 3

def load_features(feature_dir):
    features = []
    labels = []
    file_paths = []
    for root, _, files in os.walk(feature_dir):
        for file in files:
            if file.endswith('.npy'):
                file_path = os.path.join(root, file)
                feature = np.load(file_path)
                features.append(feature)
                file_paths.append(file_path)
                
                # Extract label from filename (assuming format: instrument_type_xxx-yyy-zzz.npy)
                label = os.path.basename(file_path).split('_')[0]
                labels.append(label)
    
    return np.array(features), np.array(labels), file_paths

class HDBSCANMAPElites:
    def __init__(self, features, labels, file_paths, min_cluster_size=5, min_samples=3, projection_dims=2, grid_size=10, pca_components=None, elite_strategy=EliteSelectionStrategy.PARETO_DOMINANCE, weights=(0.5, 0.5)):
        self.original_features = features
        self.labels = labels
        self.file_paths = file_paths

        self.elite_strategy = elite_strategy
        self.weights = weights
        
        # Optional dimensionality reduction
        if pca_components is not None:
            self.pca = PCA(n_components=pca_components)
            self.reduced_features = self.pca.fit_transform(features)
            print(f"Reduced feature dimensions from {features.shape[1]} to {self.reduced_features.shape[1]}")
        else:
            self.pca = None
            self.reduced_features = features
        
        self.clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, min_samples=min_samples)
        self.cluster_labels = self.clusterer.fit_predict(self.reduced_features)
        
        self.clusters = {}
        for i, label in enumerate(self.cluster_labels):
            if label not in self.clusters:
                self.clusters[label] = []
            self.clusters[label].append(i)
        
        self.projection_dims = projection_dims
        self.grid_size = grid_size
        self.pca_models = {}
        self.elites = {}
        
        # Initialize PCA and elites for each cluster
        for label in self.clusters:
            if label != -1:  # Ignore noise points
                cluster_features = self.reduced_features[self.clusters[label]]
                pca = PCA(n_components=projection_dims)
                pca.fit(cluster_features)
                self.pca_models[label] = pca
                self.elites[label] = np.empty((grid_size, grid_size), dtype=object)
        
        # Initialize HNSW index for fast nearest neighbor search
        self.hnsw_index = hnswlib.Index(space='cosine', dim=self.reduced_features.shape[1])
        self.hnsw_index.init_index(max_elements=len(features), ef_construction=200, M=16)
        self.hnsw_index.add_items(self.reduced_features)
        
        print(f"Initialized with {len(self.clusters)} clusters")
        print(f"Cluster sizes: {[len(cluster) for label, cluster in self.clusters.items() if label != -1]}")
        print(f"Noise points: {len(self.clusters.get(-1, []))}")
    
    def preprocess_feature(self, feature):
        if self.pca is not None:
            return self.pca.transform(feature.reshape(1, -1))
        return feature.reshape(1, -1)
    
    def find_cluster(self, query_feature):
        processed_query = self.preprocess_feature(query_feature)
        nearest_indices, _ = self.hnsw_index.knn_query(processed_query, k=1)
        return self.cluster_labels[nearest_indices[0, 0]]
    
    def project_to_grid(self, feature, cluster_label):
        processed_feature = self.preprocess_feature(feature)
        pca = self.pca_models[cluster_label]
        projected = pca.transform(processed_feature)[0]
        grid_coords = np.clip((projected[:self.projection_dims] + 1) * self.grid_size / 2, 0, self.grid_size - 1).astype(int)
        return tuple(grid_coords)
    
    def evaluate_performance(self, query_feature):
        processed_query = self.preprocess_feature(query_feature)
        _, distances = self.hnsw_index.knn_query(processed_query, k=min(10, len(self.reduced_features)))
        return 1 / (1 + np.mean(distances[0]))  # Inverse of mean distance, bounded between 0 and 1
    
    def evaluate_novelty(self, query_feature, k=10):
        processed_query = self.preprocess_feature(query_feature)
        _, distances = self.hnsw_index.knn_query(processed_query, k=k)
        return np.mean(distances[0])  # Higher distance means more novel
    
    def update_elite(self, query_feature, performance, novelty):
        cluster_label = self.find_cluster(query_feature)
        if cluster_label == -1:  # Noise point
            return False
        
        grid_coords = self.project_to_grid(query_feature, cluster_label)
        current_elite = self.elites[cluster_label][grid_coords]
        
        if self.elite_strategy == EliteSelectionStrategy.PARETO_DOMINANCE:
            is_better = self.pareto_dominates((performance, novelty), current_elite[1] if current_elite else (0, 0))
        elif self.elite_strategy == EliteSelectionStrategy.WEIGHTED_SUM:
            new_score = self.weighted_sum((performance, novelty))
            is_better = current_elite is None or new_score > self.weighted_sum(current_elite[1])
        else:  # PERFORMANCE_ONLY
            is_better = current_elite is None or performance > current_elite[1][0]
        
        if is_better:
            self.elites[cluster_label][grid_coords] = (query_feature, (performance, novelty))
            return True
        return False
    
    @staticmethod
    def pareto_dominates(a, b):
        return all(ai >= bi for ai, bi in zip(a, b)) and any(ai > bi for ai, bi in zip(a, b))

    def weighted_sum(self, scores):
        return sum(w * s for w, s in zip(self.weights, scores))

# Example usage
if __name__ == "__main__":
    # Load features from the nsynth dataset
    feature_dir = "/Users/bjornpjo/Downloads/audio-features/nsynth-test_trad_and_learned_combined"  # Update this path
    features, labels, file_paths = load_features(feature_dir)
    print(f"Loaded {len(features)} features, each with {features.shape[1]} dimensions")
    
    # Initialize the HDBSCANMAPElites
    qd_search = HDBSCANMAPElites(features, labels, file_paths, min_cluster_size=5, min_samples=3, pca_components=50, 
                                 elite_strategy=EliteSelectionStrategy.PERFORMANCE_ONLY)

    # # For Pareto dominance
    # qd_search = HDBSCANMAPElites(..., elite_strategy=EliteSelectionStrategy.PARETO_DOMINANCE)

    # # For weighted sum
    # qd_search = HDBSCANMAPElites(..., elite_strategy=EliteSelectionStrategy.WEIGHTED_SUM, weights=(0.7, 0.3))

    # # For performance-only
    # qd_search = HDBSCANMAPElites(..., elite_strategy=EliteSelectionStrategy.PERFORMANCE_ONLY)
    
    # Perform a simple QD search
    num_iterations = 10000
    updates = 0
    for i in range(num_iterations):
        # Use a random existing feature as a starting point
        random_index = np.random.randint(len(features))
        new_feature = features[random_index] + np.random.normal(0, 0.05, features.shape[1])
        new_feature /= np.linalg.norm(new_feature)  # Renormalize after perturbation
        
        performance = qd_search.evaluate_performance(new_feature)
        novelty = qd_search.evaluate_novelty(new_feature)
        if qd_search.update_elite(new_feature, performance, novelty):
            updates += 1
        
        if (i + 1) % 1000 == 0:
            print(f"Iteration {i + 1}: {updates} elites updated")
    
    # Print results
    total_elites = 0
    for cluster, elite_grid in qd_search.elites.items():
        elite_count = np.sum(elite_grid != None)
        total_elites += elite_count
        print(f"Cluster {cluster}: {elite_count} elites")
    print(f"Total elites: {total_elites}")

    # Print some example elites
    for cluster, elite_grid in qd_search.elites.items():
        print(f"\nCluster {cluster} elite examples:")
        non_empty_cells = np.argwhere(elite_grid != None)
        for i, (x, y) in enumerate(non_empty_cells[:5]):  # Print up to 5 examples
            elite, (performance, novelty) = elite_grid[x, y]
            processed_elite = qd_search.preprocess_feature(elite)
            nearest_index, _ = qd_search.hnsw_index.knn_query(processed_elite, k=1)
            nearest_file = qd_search.file_paths[nearest_index[0, 0]]
            nearest_label = qd_search.labels[nearest_index[0, 0]]
            print(f"  Elite {i+1}: Performance = {performance:.4f}, Novelty = {novelty:.4f}, Grid coordinates = ({x}, {y})")
            print(f"    Nearest original file: {nearest_file}")
            print(f"    Nearest original label: {nearest_label}")