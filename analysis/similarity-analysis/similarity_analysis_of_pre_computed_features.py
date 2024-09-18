import numpy as np
from sklearn.decomposition import PCA
from sklearn.metrics.pairwise import cosine_similarity, euclidean_distances
import os
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt

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

def similarity_search(query, database, metric='cosine', top_k=5):
    if metric == 'cosine':
        similarities = cosine_similarity(query.reshape(1, -1), database)
    elif metric == 'euclidean':
        distances = euclidean_distances(query.reshape(1, -1), database)
        similarities = 1 / (1 + distances)  # Convert distance to similarity
    else:
        raise ValueError("Unsupported metric")
    
    top_indices = np.argsort(similarities[0])[::-1][:top_k]
    return top_indices, similarities[0][top_indices]

def evaluate_dimensionality(features, labels, n_components_range, metric='cosine'):
    X_train, X_test, y_train, y_test = train_test_split(features, labels, test_size=0.2, random_state=42)
    
    results = []
    for n in n_components_range:
        if n >= min(X_train.shape):
            print(f"Skipping n_components={n} as it's >= min(n_samples, n_features)={min(X_train.shape)}")
            continue
        
        pca = PCA(n_components=n)
        X_train_reduced = pca.fit_transform(X_train)
        X_test_reduced = pca.transform(X_test)
        
        correct_matches = 0
        for i, test_sample in enumerate(X_test_reduced):
            top_indices, _ = similarity_search(test_sample, X_train_reduced, metric=metric)
            if y_train[top_indices[0]] == y_test[i]:
                correct_matches += 1
        
        accuracy = correct_matches / len(y_test)
        variance_ratio = sum(pca.explained_variance_ratio_[:n])
        
        results.append((n, accuracy, variance_ratio))
        print(f"Components: {n}, Accuracy: {accuracy:.4f}, Variance Ratio: {variance_ratio:.4f}")
    
    return results

# Load features
feature_dir = "/Users/bjornpjo/Downloads/audio-features/nsynth-train_trad_and_learned_combined"
all_features, labels, file_paths = load_features(feature_dir)
print(f"Loaded {len(all_features)} features, each with {all_features[0].shape[0]} dimensions")
print(f"Unique labels: {np.unique(labels)}")

# Print some statistics about the features
print(f"Feature statistics:")
print(f"  Mean: {np.mean(all_features):.4f}")
print(f"  Std Dev: {np.std(all_features):.4f}")
print(f"  Min: {np.min(all_features):.4f}")
print(f"  Max: {np.max(all_features):.4f}")

# Choose a query (e.g., the first feature vector)
query_index = 0
query_features = all_features[query_index]

# Similarity search without dimensionality reduction
for metric in ['cosine', 'euclidean']:
    top_indices, similarities = similarity_search(query_features, all_features, metric=metric)
    print(f"\nTop 5 similar instruments without dimensionality reduction ({metric}):")
    for idx, sim in zip(top_indices, similarities):
        print(f"{file_paths[idx]} (Label: {labels[idx]}): {sim:.4f}")

# Determine optimal number of components
pca = PCA().fit(all_features)
cumulative_variance_ratio = np.cumsum(pca.explained_variance_ratio_)
optimal_components = np.argmax(cumulative_variance_ratio >= 0.95) + 1
print(f"\nOptimal number of components (95% variance explained): {optimal_components}")

# PCA with optimal components
pca_optimal = PCA(n_components=optimal_components)
reduced_features = pca_optimal.fit_transform(all_features)
reduced_query = pca_optimal.transform(query_features.reshape(1, -1))

for metric in ['cosine', 'euclidean']:
    top_indices_pca, similarities_pca = similarity_search(reduced_query, reduced_features, metric=metric)
    print(f"\nTop 5 similar instruments with PCA ({optimal_components} components, {metric}):")
    for idx, sim in zip(top_indices_pca, similarities_pca):
        print(f"{file_paths[idx]} (Label: {labels[idx]}): {sim:.4f}")

# Evaluate dimensionality
max_components = min(all_features.shape[0], all_features.shape[1]) - 1
n_components_range = sorted(set([10, 20, 30, 50, 70, 100, 150, 200, optimal_components]))
n_components_range = [n for n in n_components_range if n < max_components]

results_cosine = evaluate_dimensionality(all_features, labels, n_components_range, metric='cosine')
results_euclidean = evaluate_dimensionality(all_features, labels, n_components_range, metric='euclidean')

# Plot results
plt.figure(figsize=(12, 6))
plt.plot([r[0] for r in results_cosine], [r[1] for r in results_cosine], label='Cosine Similarity')
plt.plot([r[0] for r in results_euclidean], [r[1] for r in results_euclidean], label='Euclidean Distance')
plt.xlabel('Number of Components')
plt.ylabel('Accuracy')
plt.title('Accuracy vs Number of PCA Components')
plt.legend()
plt.show()

# Plot explained variance ratio
plt.figure(figsize=(12, 6))
plt.plot(n_components_range, [r[2] for r in results_cosine])
plt.xlabel('Number of Components')
plt.ylabel('Cumulative Explained Variance Ratio')
plt.title('Explained Variance Ratio vs Number of PCA Components')
plt.show()